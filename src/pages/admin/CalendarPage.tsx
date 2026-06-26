/**
 * CalendarPage — 行事曆預約管理
 * - 預約卡片以老師顏色呈現
 * - 點擊卡片開啟可編輯 Modal（auto-save）
 * - 狀態操作：確認 / 完課 / 未到場 / 取消（取消需確認彈窗）
 * - cancelled 不顯示在行事曆；completed 顯示但較淡
 * - 所有登入用戶皆可編輯
 */
import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Phone, Clock, AlertTriangle, Plus, ArrowRight, Check, X as XIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { toast } from '@/components/ui/Snackbar'
import { format, parseISO } from 'date-fns'
import { zhTW } from 'date-fns/locale/zh-TW'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import type { SelectOption } from '@/components/ui/Select'
import DatePicker from '@/components/ui/DatePicker'
import TimePicker from '@/components/ui/TimePicker'
import Modal from '@/components/ui/Modal'
import Badge from '@/components/ui/Badge'
import type { BadgeVariant } from '@/components/ui/Badge'

// ── 型別 ──────────────────────────────────────────────────────────────────────

interface Practitioner {
  id: string
  full_name: string
  color: string | null
}

interface Service {
  id: string
  name: string
  duration_minutes: number
  price: number
}

interface Booking {
  id: string
  client_id: string
  practitioner_id: string
  service_id: string
  start_time: string
  end_time: string
  status: 'pending' | 'confirmed' | 'completed' | 'no_show' | 'cancelled'
  notes: string | null
  price: number
  buffer_minutes: number
  client: { id: string; full_name: string; phone: string } | null
  practitioner: { id: string; full_name: string; color: string | null } | null
  service: { id: string; name: string; duration_minutes: number; price: number } | null
}

type ViewMode = 'month' | 'week' | 'day'

interface CalendarPageProps {
  selectedPractitionerId?: string | null
  defaultView?: ViewMode
  defaultDate?: Date
  startHour?: number
  endHour?: number
  onNewBooking?: (date: Date) => void
}

interface DayPopover {
  date: Date
  style: React.CSSProperties
}

// ── 常數 ──────────────────────────────────────────────────────────────────────

const STORE_ID = '00000000-0000-0000-0000-000000000001'

const STATUS_LABEL: Record<string, string> = {
  pending:   '待確認',
  confirmed: '已確認',
  completed: '已完課',
  cancelled: '已取消',
  no_show:   '未到場',
}

const STATUS_BADGE_VARIANT: Record<string, BadgeVariant> = {
  pending:   'amber',
  confirmed: 'blue',
  completed: 'slate',
  cancelled: 'red',
  no_show:   'red',
}

// ── 主元件 ────────────────────────────────────────────────────────────────────

export default function CalendarPage({
  selectedPractitionerId,
  defaultView = 'week',
  defaultDate,
  startHour = 9,
  endHour = 21,
  onNewBooking,
}: CalendarPageProps) {
  const [view, setView] = useState<ViewMode>(defaultView)
  const [currentDate, setCurrentDate] = useState(defaultDate || new Date())

  // 父層切換視圖或日期時同步
  useEffect(() => { setView(defaultView) }, [defaultView])
  useEffect(() => { if (defaultDate) setCurrentDate(defaultDate) }, [defaultDate?.toDateString()])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [practitioners, setPractitioners] = useState<Practitioner[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Modal 狀態
  const [modalBooking, setModalBooking] = useState<Booking | null>(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [saving, setSaving] = useState(false)

  // 拖曳狀態
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ date: string; hour: number } | null>(null)

  // Hover Tooltip
  const [hoverTooltip, setHoverTooltip] = useState<{ booking: Booking; x: number; y: number } | null>(null)

  // Day Popover（月視圖點擊格子）
  const [dayPopover, setDayPopover] = useState<DayPopover | null>(null)

  // 編輯中的欄位（local state，auto-save on change）
  const [editPractitionerId, setEditPractitionerId] = useState('')
  const [editServiceId, setEditServiceId] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')
  const [editPrice, setEditPrice] = useState<number>(0)
  const [editNotes, setEditNotes] = useState('')
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { fetchMeta() }, [])
  useEffect(() => { fetchBookings() }, [currentDate, view, selectedPractitionerId])

  // ── 資料抓取 ────────────────────────────────────────────────────────────────

  async function fetchMeta() {
    const [{ data: p }, { data: s }] = await Promise.all([
      supabase.from('practitioners').select('id, full_name, color')
        .eq('store_id', STORE_ID).eq('active', true).is('deleted_at', null),
      supabase.from('services').select('id, name, duration_minutes, price')
        .eq('store_id', STORE_ID).eq('active', true),
    ])
    setPractitioners(p ?? [])
    setServices(s ?? [])
  }

  async function fetchBookings() {
    setIsLoading(true)
    const { start, end } = getDateRange()

    let query = supabase
      .from('bookings')
      .select(`
        id, client_id, practitioner_id, service_id,
        start_time, end_time, status, notes, price, buffer_minutes,
        client:clients(id, full_name, phone),
        practitioner:practitioners(id, full_name, color),
        service:services(id, name, duration_minutes, price)
      `)
      .eq('store_id', STORE_ID)
      .gte('start_time', start.toISOString())
      .lte('start_time', end.toISOString())
      .order('start_time')

    if (selectedPractitionerId) {
      query = query.eq('practitioner_id', selectedPractitionerId)
    }

    const { data, error } = await query
    if (!error) setBookings((data ?? []) as unknown as Booking[])
    setIsLoading(false)
  }

  // ── 日期範圍計算 ─────────────────────────────────────────────────────────────

  function getDateRange(): { start: Date; end: Date } {
    const y = currentDate.getFullYear()
    const m = currentDate.getMonth()
    const d = currentDate.getDate()

    if (view === 'month') {
      return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0, 23, 59, 59) }
    }
    if (view === 'week') {
      const dow = currentDate.getDay()
      const start = new Date(y, m, d - dow)
      const end   = new Date(y, m, d - dow + 6, 23, 59, 59)
      return { start, end }
    }
    return {
      start: new Date(y, m, d, 0, 0, 0),
      end:   new Date(y, m, d, 23, 59, 59),
    }
  }

  function getDatesForView(): Date[] {
    const { start, end } = getDateRange()
    const dates: Date[] = []
    const cur = new Date(start)
    while (cur <= end) {
      dates.push(new Date(cur))
      cur.setDate(cur.getDate() + 1)
    }
    return view === 'week' ? dates.slice(0, 7) : dates
  }

  // ── 日期導航 ────────────────────────────────────────────────────────────────

  function navigate(dir: 1 | -1) {
    const d = new Date(currentDate)
    if (view === 'month') d.setMonth(d.getMonth() + dir)
    else if (view === 'week') d.setDate(d.getDate() + dir * 7)
    else d.setDate(d.getDate() + dir)
    setCurrentDate(d)
  }

  // ── Modal 開啟 ──────────────────────────────────────────────────────────────

  function openModal(booking: Booking) {
    setModalBooking(booking)
    setEditPractitionerId(booking.practitioner_id)
    setEditServiceId(booking.service_id)
    setEditDate(format(parseISO(booking.start_time), 'yyyy-MM-dd'))
    setEditTime(format(parseISO(booking.start_time), 'HH:mm'))
    setEditPrice(booking.price)
    setEditNotes(booking.notes ?? '')
    setShowCancelConfirm(false)
  }

  function closeModal() {
    setModalBooking(null)
    setShowCancelConfirm(false)
    if (notesTimer.current) clearTimeout(notesTimer.current)
  }

  // ── Auto-save ───────────────────────────────────────────────────────────────

  async function autoSave(overrides?: Partial<{
    practitionerId: string
    serviceId: string
    date: string
    time: string
    price: number
    notes: string
  }>) {
    if (!modalBooking) return
    const pId   = overrides?.practitionerId ?? editPractitionerId
    const sId   = overrides?.serviceId      ?? editServiceId
    const date  = overrides?.date           ?? editDate
    const time  = overrides?.time           ?? editTime
    const price = overrides?.price          !== undefined ? overrides.price : editPrice
    const notes = overrides?.notes          !== undefined ? overrides.notes : editNotes

    const svc = services.find(s => s.id === sId)
    const start = new Date(`${date}T${time}`)
    const end   = new Date(start.getTime() + (svc?.duration_minutes ?? 60) * 60000)

    setSaving(true)
    const { data, error } = await supabase.rpc('upsert_booking', {
      p_booking_id:      modalBooking.id,
      p_client_id:       modalBooking.client_id,
      p_practitioner_id: pId,
      p_service_id:      sId,
      p_start_time:      start.toISOString(),
      p_end_time:        end.toISOString(),
      p_buffer_minutes:  modalBooking.buffer_minutes,
      p_notes:           notes.trim() || null,
      p_store_id:        STORE_ID,
      p_price:           price,
    })
    setSaving(false)

    if (error) { toast.error('儲存失敗', error.message); return }

    const result = data as { ok: boolean; error?: string; conflict?: any }
    if (!result.ok) {
      if (result.error === 'PRACTITIONER_BLOCKED') {
        toast.error('從業人員不可預約', '該時段為封鎖時段，請更換時間或人員')
      } else if (result.error === 'TIME_CONFLICT' && result.conflict) {
        const c = result.conflict
        toast.error('時間衝突', `${c.client_name} · ${c.service_name} 已佔用此時段`)
      } else {
        toast.error('儲存失敗', result.error ?? '未知錯誤')
      }
      return
    }

    // 更新本地 bookings
    const newPractitioner = practitioners.find(p => p.id === pId)
    setBookings(prev => prev.map(b => b.id !== modalBooking.id ? b : {
      ...b,
      practitioner_id: pId,
      service_id:      sId,
      start_time:      start.toISOString(),
      end_time:        end.toISOString(),
      price,
      notes:           notes.trim() || null,
      practitioner:    newPractitioner
        ? { id: newPractitioner.id, full_name: newPractitioner.full_name, color: newPractitioner.color }
        : b.practitioner,
      service: svc
        ? { id: svc.id, name: svc.name, duration_minutes: svc.duration_minutes, price: svc.price }
        : b.service,
    }))

    // 更新 modalBooking 同步
    setModalBooking(prev => prev ? {
      ...prev,
      practitioner_id: pId, service_id: sId,
      start_time: start.toISOString(), end_time: end.toISOString(),
      price, notes: notes.trim() || null,
    } : null)
  }

  // ── 欄位 auto-save handlers ─────────────────────────────────────────────────

  function handlePractitionerChange(id: string) {
    setEditPractitionerId(id)
    autoSave({ practitionerId: id })
  }

  function handleServiceChange(id: string) {
    const svc = services.find(s => s.id === id)
    setEditServiceId(id)
    // 課程切換時帶入定價
    const newPrice = svc?.price ?? editPrice
    setEditPrice(newPrice)
    autoSave({ serviceId: id, price: newPrice })
  }

  function handleDateChange(val: string) {
    setEditDate(val)
    autoSave({ date: val })
  }

  function handleTimeChange(val: string) {
    setEditTime(val)
    autoSave({ time: val })
  }

  function handlePriceChange(val: number) {
    setEditPrice(val)
    autoSave({ price: val })
  }

  function handleNotesChange(val: string) {
    setEditNotes(val)
    // 備注 debounce 1.5 秒後 auto-save
    if (notesTimer.current) clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(() => autoSave({ notes: val }), 1500)
  }

  // ── 狀態操作 ────────────────────────────────────────────────────────────────

  async function handleStatusChange(status: string) {
    if (!modalBooking) return
    setSaving(true)
    const { error } = await supabase
      .from('bookings')
      .update({ status })
      .eq('id', modalBooking.id)
    setSaving(false)

    if (error) { toast.error('更新失敗', error.message); return }

    const labelMap: Record<string, () => void> = {
      confirmed: () => toast.success('已確認預約'),
      completed: () => toast.success('已標記完課'),
      no_show:   () => toast.warning('已標記未到場'),
      cancelled: () => toast.info('已取消預約'),
    }
    labelMap[status]?.()

    if (status === 'cancelled') {
      // 從行事曆移除 + 關閉 modal
      setBookings(prev => prev.filter(b => b.id !== modalBooking.id))
      closeModal()
    } else {
      setBookings(prev => prev.map(b =>
        b.id === modalBooking.id ? { ...b, status: status as Booking['status'] } : b
      ))
      setModalBooking(prev => prev ? { ...prev, status: status as Booking['status'] } : null)
      setShowCancelConfirm(false)
    }
  }

  // ── 卡片顏色 ────────────────────────────────────────────────────────────────

  function cardStyle(booking: Booking): React.CSSProperties {
    const color = booking.practitioner?.color ?? '#6366f1'
    if (booking.status === 'completed') return { backgroundColor: '#94a3b8', opacity: 0.6 }
    if (booking.status === 'no_show')   return { backgroundColor: color, opacity: 0.35 }
    if (booking.status === 'pending')   return { backgroundColor: color, opacity: 0.7 }
    return { backgroundColor: color }
  }

  function clientLabel(booking: Booking) {
    return booking.status === 'pending' ? '待確認' : (booking.client?.full_name ?? '')
  }

  // ── 標題顯示 ────────────────────────────────────────────────────────────────

  const datesForView = getDatesForView()

  const headerTitle = (() => {
    if (view === 'month') return format(currentDate, 'yyyy年 M月', { locale: zhTW })
    if (view === 'week') {
      const s = datesForView[0], e = datesForView[6]
      return `${format(s, 'M/d')} – ${format(e, 'M/d')}`
    }
    return format(currentDate, 'yyyy年 M月 d日 (EEEE)', { locale: zhTW })
  })()

  const isToday = (d: Date) =>
    d.toDateString() === new Date().toDateString()

  // 全部（含 cancelled），用於月視圖 badge 統計與 popover
  const allBookingsOnDate = (d: Date) =>
    bookings.filter(b => new Date(b.start_time).toDateString() === d.toDateString())

  // 不含 cancelled，用於週/日視圖卡片顯示
  const bookingsOnDate = (d: Date) =>
    allBookingsOnDate(d).filter(b => b.status !== 'cancelled')

  const bookingsOnHour = (d: Date, h: number) =>
    bookings.filter(b => {
      const s = new Date(b.start_time)
      return s.toDateString() === d.toDateString() && s.getHours() === h && b.status !== 'cancelled'
    })

  const isEditable = (status: string) => ['pending', 'confirmed'].includes(status)

  function openDayPopover(date: Date, cellEl: HTMLElement) {
    const rect = cellEl.getBoundingClientRect()
    const pw = 288
    let left = rect.left
    if (left + pw > window.innerWidth - 12) left = window.innerWidth - pw - 12
    const spaceBelow = window.innerHeight - rect.bottom
    const style: React.CSSProperties = spaceBelow >= 280 || rect.top < 280
      ? { position: 'fixed', top: rect.bottom + 4, left, width: pw, zIndex: 9999 }
      : { position: 'fixed', bottom: window.innerHeight - rect.top + 4, left, width: pw, zIndex: 9999 }
    setDayPopover({ date, style })
  }

  // ── 拖曳換時段 ──────────────────────────────────────────────────────────────

  async function rescheduleBooking(bookingId: string, newDateStr: string, newHour: number) {
    const booking = bookings.find(b => b.id === bookingId)
    if (!booking) return

    const originalStart = parseISO(booking.start_time)
    const duration = parseISO(booking.end_time).getTime() - originalStart.getTime()
    const newStart = new Date(`${newDateStr}T${String(newHour).padStart(2, '0')}:${format(originalStart, 'mm')}:00`)
    const newEnd = new Date(newStart.getTime() + duration)

    // Optimistic update
    setBookings(prev => prev.map(b => b.id !== bookingId ? b : {
      ...b, start_time: newStart.toISOString(), end_time: newEnd.toISOString(),
    }))

    const { data, error } = await supabase.rpc('upsert_booking', {
      p_booking_id:      booking.id,
      p_client_id:       booking.client_id,
      p_practitioner_id: booking.practitioner_id,
      p_service_id:      booking.service_id,
      p_start_time:      newStart.toISOString(),
      p_end_time:        newEnd.toISOString(),
      p_buffer_minutes:  booking.buffer_minutes,
      p_notes:           booking.notes,
      p_store_id:        STORE_ID,
      p_price:           booking.price,
    })

    if (error) { toast.error('移動失敗', error.message); fetchBookings(); return }
    const result = data as { ok: boolean; error?: string; conflict?: { client_name: string; service_name: string } }
    if (!result.ok) {
      if (result.error === 'TIME_CONFLICT' && result.conflict) {
        toast.error('時間衝突', `${result.conflict.client_name} · ${result.conflict.service_name} 已佔用此時段`)
      } else {
        toast.error('移動失敗', result.error ?? '未知錯誤')
      }
      fetchBookings()
      return
    }
    toast.success('預約時間已更新')
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-slate-50">

      {/* ── 內容區 ── */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-black" />
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">

            {/* 月視圖 */}
            {view === 'month' && (
              <div className="p-5">
                <div className="grid grid-cols-7 mb-2">
                  {['日','一','二','三','四','五','六'].map(d => (
                    <div key={d} className="text-center text-xs font-medium text-slate-400 py-2">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {/* 首日前的空格 */}
                  {Array.from({ length: datesForView[0].getDay() }).map((_, i) => (
                    <div key={`empty-${i}`} />
                  ))}
                  {datesForView.map(date => {
                    const allBk   = allBookingsOnDate(date)
                    const activeBk = allBk.filter(b => b.status !== 'cancelled')
                    const completedCount = allBk.filter(b => b.status === 'completed').length
                    const cancelledCount = allBk.filter(b => b.status === 'cancelled').length
                    const overflowCount  = activeBk.length > 3 ? activeBk.length - 3 : 0
                    const isPopoverOpen  = dayPopover?.date.toDateString() === date.toDateString()
                    return (
                      <div
                        key={date.toISOString()}
                        onClick={e => {
                          if (allBk.length === 0) return
                          if (isPopoverOpen) { setDayPopover(null); return }
                          openDayPopover(date, e.currentTarget)
                        }}
                        className={cn(
                          'min-h-20 p-2 rounded-xl border transition-colors',
                          allBk.length > 0 ? 'cursor-pointer' : '',
                          date.getMonth() === currentDate.getMonth()
                            ? 'bg-white border-slate-100 hover:border-slate-200'
                            : 'bg-slate-50/50 border-slate-50',
                          isToday(date) && 'border-indigo-200 bg-indigo-50/30',
                          isPopoverOpen && 'border-indigo-300 ring-2 ring-indigo-100',
                        )}
                      >
                        {/* 日期數字 + 右上角 badge */}
                        <div className="flex items-start justify-between mb-1">
                          <div className={cn(
                            'text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full shrink-0',
                            isToday(date) ? 'bg-black text-white' : 'text-slate-600',
                          )}>
                            {date.getDate()}
                          </div>
                          {/* FR-D: 狀態 badge */}
                          {(completedCount > 0 || cancelledCount > 0) && (
                            <div className="flex items-center gap-1 flex-wrap justify-end">
                              {completedCount > 0 && (
                                <span className="flex items-center gap-0.5 text-[10px] font-medium text-emerald-600 bg-emerald-50 rounded-full px-1.5 py-0.5 leading-none">
                                  <Check size={9} strokeWidth={2.5} />
                                  {completedCount}
                                </span>
                              )}
                              {cancelledCount > 0 && (
                                <span className="flex items-center gap-0.5 text-[10px] font-medium text-slate-400 bg-slate-100 rounded-full px-1.5 py-0.5 leading-none">
                                  <XIcon size={9} strokeWidth={2.5} />
                                  {cancelledCount}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* FR-A: 最多 3 筆卡片 */}
                        <div className="space-y-0.5">
                          {activeBk.slice(0, 3).map(b => (
                            <button
                              key={b.id}
                              onClick={e => { e.stopPropagation(); openModal(b) }}
                              onMouseEnter={e => {
                                const rect = e.currentTarget.getBoundingClientRect()
                                setHoverTooltip({ booking: b, x: rect.right + 8, y: rect.top })
                              }}
                              onMouseLeave={() => setHoverTooltip(null)}
                              className="w-full text-left text-xs px-1.5 py-0.5 rounded-md text-white font-medium truncate hover:brightness-110 transition-all"
                              style={cardStyle(b)}
                            >
                              {clientLabel(b)}
                            </button>
                          ))}
                          {/* 溢出徽章 */}
                          {overflowCount > 0 && (
                            <button
                              onClick={e => { e.stopPropagation(); openDayPopover(date, e.currentTarget.parentElement?.parentElement as HTMLElement ?? e.currentTarget) }}
                              className="w-full text-left text-[10px] text-indigo-500 font-medium px-1.5 py-0.5 rounded-md hover:bg-indigo-50 transition-colors"
                            >
                              +{overflowCount} 筆預約
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 週視圖 */}
            {view === 'week' && (
              <div className="overflow-x-auto">
                {/* 日期 header */}
                <div className="grid border-b border-slate-100" style={{ gridTemplateColumns: '64px repeat(7, 1fr)' }}>
                  <div className="border-r border-slate-100" />
                  {datesForView.map(date => (
                    <div key={date.toISOString()} className={cn(
                      'text-center py-3 border-r border-slate-100',
                      isToday(date) && 'bg-indigo-50/40',
                    )}>
                      <div className="text-xs text-slate-400">{format(date, 'EEE', { locale: zhTW })}</div>
                      <div className={cn(
                        'text-sm font-semibold mt-0.5 w-7 h-7 rounded-full flex items-center justify-center mx-auto',
                        isToday(date) ? 'bg-black text-white' : 'text-slate-700',
                      )}>
                        {date.getDate()}
                      </div>
                    </div>
                  ))}
                </div>
                {/* 時間格 */}
                {Array.from({ length: endHour - startHour }, (_, i) => i + startHour).map(hour => (
                  <div key={hour} className="grid border-b border-slate-50 min-h-16"
                    style={{ gridTemplateColumns: '64px repeat(7, 1fr)' }}>
                    <div className="text-right pr-3 pt-2 text-xs text-slate-300 border-r border-slate-100 shrink-0">
                      {hour}:00
                    </div>
                    {datesForView.map(date => {
                      const hBk = bookingsOnHour(date, hour)
                      const dateStr = format(date, 'yyyy-MM-dd')
                      const isDropTarget = dropTarget?.date === dateStr && dropTarget?.hour === hour
                      return (
                        <div key={date.toISOString()}
                          className={cn(
                            'px-1 py-1 border-r border-slate-100 space-y-0.5 transition-colors',
                            isToday(date) && 'bg-indigo-50/20',
                            isDropTarget && 'bg-indigo-100/60 ring-1 ring-inset ring-indigo-300',
                          )}
                          onDragOver={e => { e.preventDefault(); setDropTarget({ date: dateStr, hour }) }}
                          onDragLeave={() => setDropTarget(null)}
                          onDrop={e => {
                            e.preventDefault()
                            setDropTarget(null)
                            if (draggingId) rescheduleBooking(draggingId, dateStr, hour)
                            setDraggingId(null)
                          }}
                        >
                          {hBk.map(b => (
                            <button key={b.id}
                              draggable={isEditable(b.status)}
                              onClick={() => openModal(b)}
                              onDragStart={e => {
                                e.dataTransfer.effectAllowed = 'move'
                                setDraggingId(b.id)
                                setHoverTooltip(null)
                              }}
                              onDragEnd={() => { setDraggingId(null); setDropTarget(null) }}
                              onMouseEnter={e => {
                                const rect = e.currentTarget.getBoundingClientRect()
                                setHoverTooltip({ booking: b, x: rect.right + 8, y: rect.top })
                              }}
                              onMouseLeave={() => setHoverTooltip(null)}
                              className={cn(
                                'w-full text-left text-xs px-2 py-1 rounded-lg text-white font-medium leading-tight hover:brightness-110 transition-all',
                                draggingId === b.id && 'opacity-40',
                                isEditable(b.status) && 'cursor-grab active:cursor-grabbing',
                              )}
                              style={cardStyle(b)}
                            >
                              <div className="truncate">{clientLabel(b)}</div>
                              <div className="opacity-75 text-[10px]">{b.service?.name}</div>
                            </button>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}

            {/* 日視圖 */}
            {view === 'day' && (
              <div>
                <div className="px-6 py-3 border-b border-slate-100">
                  <h3 className={cn(
                    'text-base font-semibold',
                    isToday(currentDate) ? 'text-indigo-600' : 'text-slate-700',
                  )}>
                    {format(currentDate, 'M月 d日 (EEEE)', { locale: zhTW })}
                  </h3>
                </div>
                {Array.from({ length: endHour - startHour }, (_, i) => i + startHour).map(hour => {
                  const hBk = bookingsOnHour(currentDate, hour)
                  const dateStr = format(currentDate, 'yyyy-MM-dd')
                  const isDropTarget = dropTarget?.date === dateStr && dropTarget?.hour === hour
                  return (
                    <div key={hour}
                      className={cn(
                        'flex gap-3 px-4 py-2 border-b border-slate-50 min-h-14 transition-colors',
                        isDropTarget && 'bg-indigo-50 ring-1 ring-inset ring-indigo-200',
                      )}
                      onDragOver={e => { e.preventDefault(); setDropTarget({ date: dateStr, hour }) }}
                      onDragLeave={() => setDropTarget(null)}
                      onDrop={e => {
                        e.preventDefault()
                        setDropTarget(null)
                        if (draggingId) rescheduleBooking(draggingId, dateStr, hour)
                        setDraggingId(null)
                      }}
                    >
                      <div className="w-12 text-right text-xs text-slate-300 pt-1 shrink-0">{hour}:00</div>
                      <div className="flex-1 flex flex-wrap gap-2">
                        {hBk.map(b => (
                          <button key={b.id}
                            draggable={isEditable(b.status)}
                            onClick={() => openModal(b)}
                            onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDraggingId(b.id); setHoverTooltip(null) }}
                            onDragEnd={() => { setDraggingId(null); setDropTarget(null) }}
                            onMouseEnter={e => {
                              const rect = e.currentTarget.getBoundingClientRect()
                              setHoverTooltip({ booking: b, x: rect.right + 8, y: rect.top })
                            }}
                            onMouseLeave={() => setHoverTooltip(null)}
                            className={cn(
                              'text-left text-sm px-3 py-1.5 rounded-xl text-white font-medium hover:brightness-110 transition-all min-w-40',
                              draggingId === b.id && 'opacity-40',
                              isEditable(b.status) && 'cursor-grab active:cursor-grabbing',
                            )}
                            style={cardStyle(b)}
                          >
                            <div className="font-semibold">{clientLabel(b)}</div>
                            <div className="text-xs opacity-80">
                              {format(parseISO(b.start_time), 'HH:mm')}–{format(parseISO(b.end_time), 'HH:mm')} · {b.service?.name}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

          </div>
        )}
      </div>

      {/* ── 預約詳情 Modal ── */}
      <Modal
        open={!!modalBooking}
        onClose={closeModal}
        title="編輯預約"
        size="md"
        footer={modalBooking ? (
          /* ── Footer：操作按鈕（固定在底部） ── */
          showCancelConfirm ? (
            /* 取消確認 */
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-red-600">
                <AlertTriangle size={15} />
                <p className="text-sm font-semibold">確認取消此預約？</p>
              </div>
              <p className="text-xs text-red-400">取消後此預約將從行事曆移除（客戶紀錄仍保留）</p>
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => setShowCancelConfirm(false)}>
                  返回
                </Button>
                <Button variant="danger" className="flex-1" loading={saving} onClick={() => handleStatusChange('cancelled')}>
                  確認取消
                </Button>
              </div>
            </div>
          ) : (
            /* 狀態操作按鈕 */
            <div className="space-y-2">
              {modalBooking.status === 'pending' && (
                <Button variant="secondary" className="w-full bg-blue-50 text-blue-700 hover:bg-blue-100 border-0"
                  onClick={() => handleStatusChange('confirmed')}>
                  ✓ 確認預約
                </Button>
              )}
              {modalBooking.status === 'confirmed' && (
                <Button variant="secondary" className="w-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-0"
                  onClick={() => handleStatusChange('completed')}>
                  ✓ 標記完課
                </Button>
              )}
              {modalBooking.status === 'confirmed' && (
                <Button variant="secondary" className="w-full bg-slate-50 text-slate-600 hover:bg-slate-100 border-0"
                  onClick={() => handleStatusChange('no_show')}>
                  未到場
                </Button>
              )}
              {isEditable(modalBooking.status) && (
                <Button variant="ghost" className="w-full text-red-500 hover:bg-red-50"
                  onClick={() => setShowCancelConfirm(true)}>
                  取消預約
                </Button>
              )}
            </div>
          )
        ) : undefined}
      >
        {modalBooking && (
          <div className="space-y-5">

            {/* 狀態 + 儲存指示 */}
            <div className="flex items-center gap-2.5 -mt-1">
              <Badge variant={STATUS_BADGE_VARIANT[modalBooking.status]}>
                {STATUS_LABEL[modalBooking.status]}
              </Badge>
              {saving && <span className="text-xs text-slate-400 animate-pulse">儲存中…</span>}
            </div>

            {/* 客戶資訊（唯讀） */}
            <div className="flex items-center gap-3 bg-slate-50 rounded-2xl px-4 py-3">
              <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-semibold text-sm shrink-0">
                {modalBooking.client?.full_name?.[0]}
              </div>
              <div>
                <p className="font-semibold text-slate-900 text-sm">{modalBooking.client?.full_name}</p>
                {modalBooking.client?.phone && (
                  <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                    <Phone size={11} /> {modalBooking.client.phone}
                  </p>
                )}
              </div>
            </div>

            {isEditable(modalBooking.status) ? (
              /* ── 可編輯表單 ── */
              <div className="space-y-4">

                {/* 從業人員 */}
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">從業人員</label>
                  <Select
                    value={editPractitionerId}
                    onChange={handlePractitionerChange}
                    options={practitioners.map(p => ({
                      value: p.id,
                      label: p.full_name,
                      color: p.color ?? undefined,
                    } satisfies SelectOption))}
                  />
                </div>

                {/* 課程 */}
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">課程</label>
                  <Select
                    value={editServiceId}
                    onChange={handleServiceChange}
                    options={services.map(s => ({
                      value: s.id,
                      label: `${s.name} · ${s.duration_minutes}分鐘`,
                    }))}
                  />
                </div>

                {/* 日期 + 時間 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">日期</label>
                    <DatePicker value={editDate} onChange={handleDateChange} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">時間</label>
                    <TimePicker value={editTime} onChange={handleTimeChange} startHour={startHour} endHour={endHour} />
                  </div>
                </div>

                {/* 結束時間預覽 */}
                {editDate && editTime && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 -mt-2 pl-1">
                    <Clock size={11} />
                    結束：{(() => {
                      const svc = services.find(s => s.id === editServiceId)
                      const end = new Date(new Date(`${editDate}T${editTime}`).getTime() + (svc?.duration_minutes ?? 60) * 60000)
                      return format(end, 'HH:mm')
                    })()}
                    （{services.find(s => s.id === editServiceId)?.duration_minutes ?? 60} 分鐘）
                  </div>
                )}

                {/* 實收金額 */}
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">
                    實收金額
                    {services.find(s => s.id === editServiceId)?.price !== undefined && (
                      <span className="ml-1.5 font-normal text-slate-400">
                        （定價 NT$ {services.find(s => s.id === editServiceId)!.price.toLocaleString()}）
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-sm text-slate-400 pointer-events-none">NT$</span>
                    <input
                      type="number"
                      min={0}
                      value={editPrice}
                      onChange={e => handlePriceChange(Number(e.target.value))}
                      onBlur={e => autoSave({ price: Number(e.target.value) })}
                      className="w-full h-10 pl-10 pr-3 text-sm border border-slate-200 rounded-2xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-shadow"
                    />
                  </div>
                  {editPrice !== (services.find(s => s.id === editServiceId)?.price ?? editPrice) && (
                    <p className="text-xs text-amber-500 mt-1 pl-1">已套用優惠價（與定價不同）</p>
                  )}
                </div>

                {/* 備注 */}
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">備注</label>
                  <textarea
                    value={editNotes}
                    onChange={e => handleNotesChange(e.target.value)}
                    rows={3}
                    placeholder="選填"
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-2xl bg-white resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-shadow placeholder-slate-300"
                  />
                </div>

              </div>
            ) : (
              /* ── 唯讀詳情（completed / no_show） ── */
              <div className="space-y-3 bg-slate-50 rounded-2xl p-4 text-sm">
                <InfoRow label="從業人員">{modalBooking.practitioner?.full_name}</InfoRow>
                <InfoRow label="課程">{modalBooking.service?.name}</InfoRow>
                <InfoRow label="時間">
                  {format(parseISO(modalBooking.start_time), 'M/d HH:mm', { locale: zhTW })} –{' '}
                  {format(parseISO(modalBooking.end_time), 'HH:mm')}
                </InfoRow>
                <InfoRow label="實收金額">
                  <span className="font-semibold text-emerald-600">NT$ {modalBooking.price.toLocaleString()}</span>
                </InfoRow>
                {modalBooking.notes && (
                  <InfoRow label="備注">{modalBooking.notes}</InfoRow>
                )}
              </div>
            )}

          </div>
        )}
      </Modal>

      {/* ── Day Popover（月視圖點擊格子） ── */}
      {dayPopover && createPortal(
        <>
          {/* 背景遮罩（點外關閉） */}
          <div className="fixed inset-0 z-[9998]" onClick={() => setDayPopover(null)} />
          <div
            className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden"
            style={dayPopover.style}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <span className="text-sm font-semibold text-slate-800">
                {format(dayPopover.date, 'M月 d日 (EEE)', { locale: zhTW })}
              </span>
              <div className="flex items-center gap-1.5">
                {onNewBooking && (
                  <button
                    onClick={() => { onNewBooking(dayPopover.date); setDayPopover(null) }}
                    className="flex items-center gap-1 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition-colors"
                  >
                    <Plus size={12} strokeWidth={2.5} />
                    新增預約
                  </button>
                )}
                <button
                  onClick={() => { setView('day'); setCurrentDate(dayPopover.date); setDayPopover(null) }}
                  className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 px-2.5 py-1 rounded-lg transition-colors"
                >
                  日視圖
                  <ArrowRight size={11} strokeWidth={2} />
                </button>
              </div>
            </div>

            {/* 預約清單 */}
            <div className="max-h-72 overflow-y-auto py-1">
              {allBookingsOnDate(dayPopover.date)
                .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
                .map(b => (
                  <button
                    key={b.id}
                    onClick={() => { if (b.status !== 'cancelled') { openModal(b); setDayPopover(null) } }}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                      b.status === 'cancelled'
                        ? 'opacity-40 cursor-default'
                        : 'hover:bg-slate-50 cursor-pointer',
                    )}
                  >
                    {/* 顏色條 */}
                    <div
                      className="w-1 h-8 rounded-full shrink-0"
                      style={{ backgroundColor: b.status === 'cancelled' ? '#94a3b8' : (b.practitioner?.color ?? '#6366f1') }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-800 truncate">
                          {clientLabel(b)}
                        </span>
                        <span className={cn(
                          'text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0',
                          b.status === 'completed' && 'bg-emerald-50 text-emerald-600',
                          b.status === 'confirmed' && 'bg-blue-50 text-blue-600',
                          b.status === 'pending'   && 'bg-amber-50 text-amber-600',
                          b.status === 'cancelled' && 'bg-slate-100 text-slate-400',
                          b.status === 'no_show'   && 'bg-red-50 text-red-500',
                        )}>
                          {STATUS_LABEL[b.status]}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-slate-400">
                          {format(parseISO(b.start_time), 'HH:mm')}–{format(parseISO(b.end_time), 'HH:mm')}
                        </span>
                        {b.practitioner?.full_name && (
                          <span className="text-[11px] text-slate-400 truncate">
                            · {b.practitioner.full_name}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              }
            </div>
          </div>
        </>,
        document.body,
      )}

      {/* ── Hover Tooltip ── */}
      {hoverTooltip && !draggingId && (
        <div
          className="fixed z-50 bg-white rounded-2xl shadow-xl border border-slate-100 p-4 pointer-events-none"
          style={{
            left: Math.min(hoverTooltip.x, window.innerWidth - 225),
            width: 215,
            // 若距底部不足 220px 則往上顯示
            ...(hoverTooltip.y + 220 > window.innerHeight
              ? { bottom: window.innerHeight - hoverTooltip.y, top: 'auto' }
              : { top: hoverTooltip.y }),
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2.5 h-2.5 rounded-full" style={cardStyle(hoverTooltip.booking)} />
            <Badge variant={STATUS_BADGE_VARIANT[hoverTooltip.booking.status]}>
              {STATUS_LABEL[hoverTooltip.booking.status]}
            </Badge>
          </div>
          <p className="font-bold text-slate-900 text-sm">{hoverTooltip.booking.client?.full_name}</p>
          {hoverTooltip.booking.client?.phone && (
            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
              <Phone size={10} /> {hoverTooltip.booking.client.phone}
            </p>
          )}
          <div className="mt-2 pt-2 border-t border-slate-100 space-y-1">
            {hoverTooltip.booking.practitioner?.full_name && (
              <p className="text-xs text-slate-600">{hoverTooltip.booking.practitioner.full_name}</p>
            )}
            {hoverTooltip.booking.service?.name && (
              <p className="text-xs text-slate-600">{hoverTooltip.booking.service.name}</p>
            )}
            <p className="text-xs text-slate-400 flex items-center gap-1">
              <Clock size={10} />
              {format(parseISO(hoverTooltip.booking.start_time), 'M/d HH:mm')} – {format(parseISO(hoverTooltip.booking.end_time), 'HH:mm')}
            </p>
            <p className="text-xs font-semibold text-emerald-600">NT$ {hoverTooltip.booking.price.toLocaleString()}</p>
          </div>
          {isEditable(hoverTooltip.booking.status) && (
            <p className="text-[10px] text-slate-300 mt-2">拖曳可調整時間</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-400 shrink-0">{label}</span>
      <span className="text-slate-800 font-medium text-right">{children}</span>
    </div>
  )
}
