import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  CalendarCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Phone,
  RefreshCw,
  Sparkles,
  UserRound,
} from 'lucide-react'
import { format, isSameDay } from 'date-fns'
import { zhTW } from 'date-fns/locale/zh-TW'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/cn'
import Spinner from '@/components/ui/Spinner'
import type { BookingStatus } from '@/types/database'

interface TodayBooking {
  id: string
  start_time: string
  end_time: string
  status: BookingStatus
  notes: string | null
  client: {
    id: string
    full_name: string
    phone: string
    notes: string | null
  } | null
  service: {
    id: string
    name: string
    duration_minutes: number
  } | null
  practitioner: {
    id: string
    full_name: string
    color: string
  } | null
}

const STATUS_META: Record<BookingStatus, {
  label: string
  chip: string
  dot: string
}> = {
  pending: {
    label: '待確認',
    chip: 'bg-amber-50 text-amber-700 ring-amber-200',
    dot: 'bg-amber-400',
  },
  confirmed: {
    label: '已確認',
    chip: 'bg-[#F1F8E7] text-[#527A1E] ring-[#CFE3B0]',
    dot: 'bg-[#83B735]',
  },
  completed: {
    label: '已完課',
    chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    dot: 'bg-emerald-500',
  },
  cancelled: {
    label: '已取消',
    chip: 'bg-rose-50 text-rose-600 ring-rose-100',
    dot: 'bg-rose-300',
  },
  no_show: {
    label: '未到場',
    chip: 'bg-slate-100 text-slate-600 ring-slate-200',
    dot: 'bg-slate-400',
  },
}

function startAndEndOfDay(date: Date) {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const end = new Date(date)
  end.setHours(23, 59, 59, 999)
  return { start: start.toISOString(), end: end.toISOString() }
}

function moveDate(date: Date, amount: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

function bookingTime(iso: string) {
  return format(new Date(iso), 'HH:mm')
}

function BookingStatusChip({ status }: { status: BookingStatus }) {
  const meta = STATUS_META[status]
  return (
    <span className={cn(
      'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset',
      meta.chip,
    )}>
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  )
}

function AgendaCard({ booking, isNext }: { booking: TodayBooking; isNext: boolean }) {
  const inactive = booking.status === 'cancelled' || booking.status === 'no_show'
  return (
    <article className={cn(
      'relative grid grid-cols-[50px_minmax(0,1fr)] gap-3 rounded-[24px] border bg-white p-4 transition-shadow',
      isNext
        ? 'border-violet-200 shadow-[0_16px_45px_-26px_rgba(79,70,229,0.65)]'
        : 'border-slate-200 shadow-sm',
      inactive && 'opacity-60',
    )}>
      {isNext && (
        <span className="absolute -top-2.5 right-4 inline-flex items-center gap-1 rounded-full bg-violet-600 px-2.5 py-1 text-[10px] font-bold tracking-wide text-white shadow-sm">
          <Sparkles size={10} /> 下一位
        </span>
      )}

      <div className="pt-0.5 text-center">
        <p className="font-mono text-base font-bold tabular-nums text-slate-900">
          {bookingTime(booking.start_time)}
        </p>
        <p className="mt-0.5 font-mono text-[10px] tabular-nums text-slate-400">
          {bookingTime(booking.end_time)}
        </p>
      </div>

      <div className="min-w-0 border-l border-slate-100 pl-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold text-slate-900">
              {booking.client?.full_name ?? '未命名客戶'}
            </h3>
            <p className="mt-0.5 truncate text-sm text-slate-500">
              {booking.service?.name ?? '未設定課程'}
            </p>
          </div>
          <BookingStatusChip status={booking.status} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-slate-500">
          {booking.client?.phone && (
            <a
              href={`tel:${booking.client.phone}`}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-slate-50 px-2.5 font-medium text-slate-700 active:bg-slate-100"
            >
              <Phone size={12} /> {booking.client.phone}
            </a>
          )}
          {booking.practitioner && (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: booking.practitioner.color }}
              />
              {booking.practitioner.full_name}
            </span>
          )}
        </div>

        {(booking.notes || booking.client?.notes) && (
          <p className="mt-3 line-clamp-2 rounded-xl bg-amber-50/70 px-3 py-2 text-xs leading-relaxed text-amber-800">
            {booking.notes || booking.client?.notes}
          </p>
        )}
      </div>
    </article>
  )
}

export default function TodayPage() {
  const { profile, isAdmin } = useAuth()
  const [date, setDate] = useState(() => new Date())
  const [bookings, setBookings] = useState<TodayBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const loadBookings = useCallback(async () => {
    if (!profile?.store_id) return
    setLoading(true)
    setError(null)
    const range = startAndEndOfDay(date)

    let query = supabase
      .from('bookings')
      .select(`
        id,
        start_time,
        end_time,
        status,
        notes,
        client:clients(id, full_name, phone, notes),
        service:services(id, name, duration_minutes),
        practitioner:practitioners(id, full_name, color)
      `)
      .eq('store_id', profile.store_id)
      .is('deleted_at', null)
      .gte('start_time', range.start)
      .lte('start_time', range.end)
      .order('start_time', { ascending: true })

    if (!isAdmin && profile.practitioner_id) {
      query = query.eq('practitioner_id', profile.practitioner_id)
    }

    const { data, error: queryError } = await query
    if (queryError) {
      setError('今日行程暫時無法載入，請稍後再試。')
    } else {
      setBookings((data ?? []) as unknown as TodayBooking[])
    }
    setLoading(false)
  }, [date, isAdmin, profile])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { void loadBookings() })
    return () => window.cancelAnimationFrame(frame)
  }, [loadBookings])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!profile?.store_id) return
    const channel = supabase
      .channel(`today-workspace-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `store_id=eq.${profile.store_id}`,
        },
        () => { void loadBookings() },
      )
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [loadBookings, profile?.id, profile?.store_id])

  const nextBooking = useMemo(() => bookings.find(booking => (
    ['pending', 'confirmed'].includes(booking.status)
    && new Date(booking.end_time).getTime() > now
  )), [bookings, now])

  const counts = useMemo(() => ({
    waiting: bookings.filter(booking => booking.status === 'pending').length,
    upcoming: bookings.filter(booking => booking.status === 'confirmed').length,
    completed: bookings.filter(booking => booking.status === 'completed').length,
  }), [bookings])

  const today = isSameDay(date, new Date())
  const memberWithoutPractitioner = !isAdmin && !profile?.practitioner_id

  return (
    <div className="min-h-full bg-[#F7F8FB] pb-6">
      <header className="border-b border-slate-200 bg-white px-4 pb-5 pt-4 sm:px-8 sm:pt-6">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-600">
                {isAdmin ? '全店節奏' : '我的節奏'}
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                {today ? '今天先照顧好每一位' : format(date, 'M 月 d 日行程', { locale: zhTW })}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {profile?.full_name ?? 'Bookr 團隊'} · {format(date, 'EEEE', { locale: zhTW })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadBookings()}
              aria-label="重新整理今日行程"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm active:scale-95"
            >
              <RefreshCw size={16} />
            </button>
          </div>

          <div className="mt-5 grid grid-cols-[40px_minmax(0,1fr)_40px] items-center gap-2">
            <button
              type="button"
              onClick={() => setDate(current => moveDate(current, -1))}
              aria-label="前一天"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 active:scale-95"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => setDate(new Date())}
              className="min-h-10 truncate rounded-full bg-slate-950 px-4 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 active:scale-[0.98]"
            >
              {today ? format(date, 'M 月 d 日 · 今天', { locale: zhTW }) : format(date, 'M 月 d 日 · EEEE', { locale: zhTW })}
            </button>
            <button
              type="button"
              onClick={() => setDate(current => moveDate(current, 1))}
              aria-label="後一天"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 active:scale-95"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5 sm:px-8">
        {memberWithoutPractitioner && (
          <div className="mb-4 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <AlertCircle className="mt-0.5 shrink-0" size={18} />
            <p>你的帳號尚未綁定老師資料，目前會顯示全店行程。請由管理員到成員設定完成綁定。</p>
          </div>
        )}

        <section aria-label="今日狀態" className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-3 sm:p-4">
            <Clock3 size={16} className="text-amber-600" />
            <p className="mt-2 font-mono text-2xl font-black tabular-nums text-slate-950">{counts.waiting}</p>
            <p className="text-[11px] font-medium text-slate-500 sm:text-xs">待確認</p>
          </div>
          <div className="rounded-2xl border border-[#DDE8CB] bg-[#F4F8ED] p-3 sm:p-4">
            <CalendarCheck size={16} className="text-[#6C9B2B]" />
            <p className="mt-2 font-mono text-2xl font-black tabular-nums text-slate-950">{counts.upcoming}</p>
            <p className="text-[11px] font-medium text-slate-500 sm:text-xs">已確認</p>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3 sm:p-4">
            <CheckCircle2 size={16} className="text-emerald-600" />
            <p className="mt-2 font-mono text-2xl font-black tabular-nums text-slate-950">{counts.completed}</p>
            <p className="text-[11px] font-medium text-slate-500 sm:text-xs">已完課</p>
          </div>
        </section>

        <div className="mt-6 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">今日客戶</p>
            <h2 className="mt-0.5 text-lg font-bold text-slate-900">依時間往下看</h2>
          </div>
          <Link to="/admin/bookings" className="text-sm font-semibold text-violet-600">
            完整行事曆
          </Link>
        </div>

        {loading ? (
          <div className="flex min-h-52 items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : error ? (
          <div className="mt-4 rounded-3xl border border-rose-100 bg-white p-8 text-center shadow-sm">
            <AlertCircle className="mx-auto text-rose-400" size={28} />
            <p className="mt-3 font-semibold text-slate-800">{error}</p>
            <button type="button" onClick={() => void loadBookings()} className="mt-3 text-sm font-semibold text-violet-600">
              再試一次
            </button>
          </div>
        ) : bookings.length === 0 ? (
          <div className="mt-4 rounded-3xl border border-dashed border-slate-300 bg-white/70 px-6 py-12 text-center">
            <UserRound className="mx-auto text-slate-300" size={32} />
            <p className="mt-3 font-bold text-slate-700">這天沒有預約</p>
            <p className="mt-1 text-sm text-slate-400">可以安心安排備課或休息。</p>
          </div>
        ) : (
          <div className="relative mt-4 space-y-3">
            <div className="absolute bottom-6 left-[40px] top-6 hidden w-px bg-slate-200 sm:block" />
            {bookings.map(booking => (
              <AgendaCard key={booking.id} booking={booking} isNext={booking.id === nextBooking?.id} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
