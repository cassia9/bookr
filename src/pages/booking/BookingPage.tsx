import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { format, addMonths, isSameDay, parseISO, addHours } from 'date-fns'
import { zhTW } from 'date-fns/locale/zh-TW'
import { ChevronLeft, ChevronRight, CheckCircle, User, Clock,
         CalendarDays, Phone, MessageSquare, MapPin, AlertCircle } from 'lucide-react'
import liff from '@line/liff'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import Input from '@/components/ui/Input'
import FormField from '@/components/ui/FormField'
import Button from '@/components/ui/Button'
import type { Service, Practitioner } from '@/types/database'

const STEP_LABELS = ['服務', '人員', '日期', '時段', '資料']

// ── Types ──────────────────────────────────────────────────────────────

interface SlotItem {
  slot_time:          string
  practitioner_id:    string
  practitioner_name:  string
  practitioner_color: string
}

interface StoreInfo {
  name:                     string
  phone:                    string | null
  address:                  string | null
  open_time:                string
  close_time:               string
  logo_url:                 string | null
  liff_id:                  string | null
  booking_enabled:          boolean
  booking_confirmation_mode: string
}

interface BookingDraft {
  service:            Service | null
  practitionerChoice: Practitioner | null
  date:               string
  slot:               SlotItem | null
  name:               string
  phone:              string
  notes:              string
}

type BookingSource = 'line' | 'messenger' | 'web'

// ── Main Page ──────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function BookingPage() {
  const { storeId: storeParam } = useParams<{ storeId: string }>()
  const [resolvedStoreId, setResolvedStoreId] = useState<string | null>(null)

  const [step, setStep] = useState(1)
  const [store, setStore] = useState<StoreInfo | null>(null)
  const [storeError, setStoreError] = useState('')
  const [services, setServices] = useState<Service[]>([])
  const [practitioners, setPractitioners] = useState<Practitioner[]>([])

  // LINE LIFF state
  const [lineAvatar, setLineAvatar] = useState<string | null>(null)
  const [lineUserId, setLineUserId] = useState<string | null>(null)
  const [source, setSource] = useState<BookingSource>('web')

  const [draft, setDraft] = useState<BookingDraft>({
    service: null, practitionerChoice: null,
    date: '', slot: null,
    name: '', phone: '', notes: '',
  })
  const [confirmedId, setConfirmedId] = useState('')
  const [confirmedStatus, setConfirmedStatus] = useState<'pending' | 'confirmed'>('pending')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // ── 解析 storeParam（UUID 或 slug）──────────────────────────────────
  useEffect(() => {
    if (!storeParam) { setStoreError('無效的預約連結'); return }
    if (UUID_RE.test(storeParam)) {
      setResolvedStoreId(storeParam)
    } else {
      supabase.rpc('get_store_by_code', { p_code: storeParam }).then(({ data }) => {
        if (!data) { setStoreError('找不到此預約頁面'); return }
        setResolvedStoreId(data as string)
      })
    }
  }, [storeParam])

  // ── Load store + services + practitioners ──────────────────────────
  useEffect(() => {
    if (!resolvedStoreId) return

    Promise.all([
      supabase.from('stores')
        .select('name,phone,address,open_time,close_time,logo_url,liff_id,booking_enabled,booking_confirmation_mode')
        .eq('id', resolvedStoreId).single(),
      supabase.from('services')
        .select('*').eq('store_id', resolvedStoreId).eq('active', true).order('name'),
      supabase.from('practitioners')
        .select('*').eq('store_id', resolvedStoreId).eq('active', true).order('created_at'),
    ]).then(([{ data: s, error: sErr }, { data: sv }, { data: p }]) => {
      if (sErr || !s) { setStoreError('找不到此預約頁面'); return }
      if (!s.booking_enabled) { setStoreError('此店家目前暫停線上預約'); return }
      setStore({
        name:                     s.name ?? '',
        phone:                    s.phone ?? null,
        address:                  s.address ?? null,
        open_time:               (s.open_time  ?? '09:00:00').slice(0, 5),
        close_time:              (s.close_time ?? '21:00:00').slice(0, 5),
        logo_url:                 s.logo_url ?? null,
        liff_id:                  s.liff_id ?? null,
        booking_enabled:          s.booking_enabled ?? true,
        booking_confirmation_mode: s.booking_confirmation_mode ?? 'manual',
      })
      setServices(sv ?? [])
      setPractitioners(p ?? [])

      // 嘗試初始化 LINE LIFF
      initLiff(s.liff_id)
    })
  }, [resolvedStoreId])

  // ── LINE LIFF 初始化 ────────────────────────────────────────────────
  async function initLiff(liffId: string | null) {
    if (!liffId) return
    const isLiffEnv =
      window.location.href.includes('liff.state') ||
      navigator.userAgent.includes('Line')
    if (!isLiffEnv) return
    try {
      await liff.init({ liffId })
      if (!liff.isLoggedIn()) { liff.login(); return }
      const profile = await liff.getProfile()
      setDraft(d => ({ ...d, name: d.name || profile.displayName }))
      setLineAvatar(profile.pictureUrl ?? null)
      setLineUserId(profile.userId)
      setSource('line')
    } catch (err) {
      console.warn('LIFF init failed:', err)
    }
  }

  // ── Submit ─────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!draft.service || !draft.slot || !draft.name.trim() || !draft.phone.trim() || !resolvedStoreId) return
    setSubmitting(true)
    setSubmitError('')

    const startTs = new Date(`${draft.date}T${draft.slot.slot_time}:00`)

    const { data, error } = await supabase.rpc('create_booking_public', {
      p_full_name:          draft.name.trim(),
      p_phone:              draft.phone.trim(),
      p_service_id:         draft.service.id,
      p_practitioner_id:    draft.slot.practitioner_id,
      p_start_time:         startTs.toISOString(),
      p_notes:              draft.notes.trim() || null,
      p_store_id:           resolvedStoreId,
      p_source:             source,
      p_client_line_id:     lineUserId,
      p_client_picture_url: lineAvatar,
    })

    setSubmitting(false)

    if (error) { setSubmitError('系統錯誤，請稍後再試'); return }

    const result = data as { ok: boolean; error?: string; id?: string; status?: string }
    if (!result.ok) {
      if (result.error === 'CONFLICT') {
        setSubmitError('此時段剛被預約，請返回重新選擇時段')
      } else {
        setSubmitError('預約失敗，請稍後再試')
      }
      return
    }

    setConfirmedId(result.id ?? '')
    setConfirmedStatus((result.status ?? 'pending') as 'pending' | 'confirmed')
    setStep(6)
  }

  // ── Error / not found ──────────────────────────────────────────────
  if (storeError) {
    return (
      <div className="min-h-dvh bg-slate-50 flex items-center justify-center px-6">
        <div className="text-center">
          <AlertCircle size={48} strokeWidth={1.5} className="mx-auto text-slate-300 mb-4" />
          <p className="font-semibold text-slate-700 mb-1">{storeError}</p>
          <p className="text-sm text-slate-400">請確認連結是否正確，或聯絡店家取得新連結</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-slate-50 flex flex-col">
      {/* Store header */}
      <div className="bg-white pt-safe">
        <div className="h-20 bg-gradient-to-br from-indigo-50 to-violet-50" />
        <div className="max-w-md mx-auto px-4 pb-3 flex items-end gap-3 -mt-10">
          <div className="w-20 h-20 rounded-3xl overflow-hidden shadow-xl ring-4 ring-white shrink-0 relative z-10">
            {store?.logo_url ? (
              <img src={store.logo_url} alt={store.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-indigo-600 flex items-center justify-center text-white font-bold text-3xl">
                {store?.name?.[0] ?? ''}
              </div>
            )}
          </div>
          <div className="pb-1 min-w-0 flex-1">
            <p className="font-bold text-slate-900 text-base leading-snug truncate">
              {store?.name ?? '載入中…'}
            </p>
            {store?.address && (
              <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5 truncate">
                <MapPin size={10} strokeWidth={1.5} className="shrink-0" />{store.address}
              </p>
            )}
          </div>
        </div>
        <div className="border-b border-slate-100" />
      </div>

      {/* Step bar */}
      {step < 6 && (
        <div className="bg-white border-b border-slate-100">
          <div className="max-w-md mx-auto px-4 py-3">
            <div className="flex items-center gap-1">
              {STEP_LABELS.map((label, i) => {
                const s      = i + 1
                const done   = step > s
                const active = step === s
                return (
                  <div key={s} className="flex items-center flex-1 last:flex-none">
                    <div className="flex flex-col items-center">
                      <div className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-all',
                        done   ? 'bg-indigo-600 text-white' :
                        active ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-400' :
                                 'bg-slate-100 text-slate-400',
                      )}>
                        {done ? '✓' : s}
                      </div>
                      <span className={cn(
                        'text-[10px] mt-0.5 font-medium',
                        active ? 'text-indigo-600' : 'text-slate-400',
                      )}>
                        {label}
                      </span>
                    </div>
                    {i < 4 && (
                      <div className={cn(
                        'flex-1 h-0.5 mx-1 mb-4 rounded-full',
                        done ? 'bg-indigo-400' : 'bg-slate-200',
                      )} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 max-w-md mx-auto w-full px-4 py-6">
        {step === 1 && (
          <Step1Service
            services={services}
            onSelect={svc => { setDraft(d => ({ ...d, service: svc })); setStep(2) }}
          />
        )}
        {step === 2 && (
          <Step2Practitioner
            practitioners={practitioners}
            selected={draft.practitionerChoice}
            onSelect={p => { setDraft(d => ({ ...d, practitionerChoice: p, slot: null })); setStep(3) }}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && (
          <Step3Date
            onSelect={date => { setDraft(d => ({ ...d, date, slot: null })); setStep(4) }}
            onBack={() => setStep(2)}
          />
        )}
        {step === 4 && draft.service && draft.date && storeId && (
          <Step4Time
            storeId={storeId}
            date={draft.date}
            serviceId={draft.service.id}
            practitionerId={draft.practitionerChoice?.id ?? null}
            selected={draft.slot}
            onSelect={slot => { setDraft(d => ({ ...d, slot })); setStep(5) }}
            onBack={() => setStep(3)}
          />
        )}
        {step === 5 && (
          <Step5Info
            draft={draft}
            lineAvatar={lineAvatar}
            onChange={(k, v) => setDraft(d => ({ ...d, [k]: v }))}
            onSubmit={handleSubmit}
            onBack={() => setStep(4)}
            submitting={submitting}
            error={submitError}
          />
        )}
        {step === 6 && draft.service && draft.slot && (
          <Step6Success
            store={store}
            draft={draft}
            confirmedId={confirmedId}
            confirmedStatus={confirmedStatus}
            onRebook={() => {
              setDraft({ service: null, practitionerChoice: null, date: '', slot: null, name: '', phone: '', notes: '' })
              setConfirmedId('')
              setSubmitError('')
              setStep(1)
            }}
          />
        )}
      </div>
    </div>
  )
}

// ── Step 1: 選擇服務 ───────────────────────────────────────────────────

function Step1Service({ services, onSelect }: {
  services: Service[]
  onSelect: (s: Service) => void
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900 mb-1">選擇服務</h2>
      <p className="text-sm text-slate-400 mb-5">請選擇您想要預約的服務項目</p>
      {services.length === 0 ? (
        <div className="text-center py-12 text-slate-400">目前尚無可預約服務</div>
      ) : (
        <div className="space-y-3">
          {services.map(svc => (
            <button
              key={svc.id}
              onClick={() => onSelect(svc)}
              className="w-full text-left bg-white rounded-2xl border border-slate-100 shadow-sm p-4 hover:border-indigo-300 hover:shadow-md active:scale-[0.98] transition-all"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{svc.name}</p>
                  {svc.description && (
                    <p className="text-sm text-slate-400 mt-0.5 line-clamp-2">{svc.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Clock size={12} strokeWidth={1.5} /> {svc.duration_minutes} 分鐘
                    </span>
                    {svc.price > 0 && (
                      <span className="text-xs font-semibold text-indigo-600">
                        NT$ {svc.price.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight size={18} strokeWidth={1.5} className="text-slate-300 shrink-0" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Step 2: 選擇從業人員 ───────────────────────────────────────────────

function Step2Practitioner({ practitioners, selected, onSelect, onBack }: {
  practitioners: Practitioner[]
  selected: Practitioner | null
  onSelect: (p: Practitioner | null) => void
  onBack: () => void
}) {
  return (
    <div>
      <BackButton onClick={onBack} />
      <h2 className="text-lg font-semibold text-slate-900 mb-1">選擇從業人員</h2>
      <p className="text-sm text-slate-400 mb-5">可指定特定人員，或讓系統依可用時段自動安排</p>
      <div className="space-y-3">
        <button
          onClick={() => onSelect(null)}
          className={cn(
            'w-full text-left bg-white rounded-2xl border shadow-sm p-4 hover:border-indigo-300 active:scale-[0.98] transition-all',
            selected === null ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-100',
          )}
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
              <User size={18} strokeWidth={1.5} className="text-slate-400" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">不指定（系統安排）</p>
              <p className="text-xs text-slate-400 mt-0.5">依您選擇的時段，安排最適合的人員</p>
            </div>
          </div>
        </button>

        {practitioners.map(p => (
          <button
            key={p.id}
            onClick={() => onSelect(p)}
            className={cn(
              'w-full text-left bg-white rounded-2xl border shadow-sm p-4 hover:border-indigo-300 active:scale-[0.98] transition-all',
              selected?.id === p.id ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-100',
            )}
          >
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold shrink-0"
                style={{ backgroundColor: p.color ?? '#6366f1' }}>
                {p.full_name[0]}
              </div>
              <div>
                <p className="font-semibold text-slate-900">{p.full_name}</p>
                {(p as any).title && (
                  <p className="text-xs text-slate-400 mt-0.5">{(p as any).title}</p>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Step 3: 選擇日期 ───────────────────────────────────────────────────

function Step3Date({ onSelect, onBack }: {
  onSelect: (date: string) => void
  onBack: () => void
}) {
  const today   = new Date()
  const minDate = addHours(today, 2)
  const maxDate = addMonths(today, 2)
  const [view, setView] = useState({ y: today.getFullYear(), m: today.getMonth() })

  const firstDay = new Date(view.y, view.m, 1)
  const startDow = (firstDay.getDay() + 6) % 7
  const totalDays = new Date(view.y, view.m + 1, 0).getDate()

  const canPrev = !(view.y === today.getFullYear() && view.m === today.getMonth())
  const canNext = new Date(view.y, view.m + 1, 1) <= addMonths(today, 2)

  return (
    <div>
      <BackButton onClick={onBack} />
      <h2 className="text-lg font-semibold text-slate-900 mb-1">選擇日期</h2>
      <p className="text-sm text-slate-400 mb-5">可預約範圍：2 小時後 ～ 2 個月內</p>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setView(v => v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 })}
            disabled={!canPrev}
            className="p-2 rounded-xl hover:bg-slate-100 transition disabled:opacity-30">
            <ChevronLeft size={18} strokeWidth={2} className="text-slate-600" />
          </button>
          <span className="font-semibold text-slate-900">{view.y} 年 {view.m + 1} 月</span>
          <button onClick={() => setView(v => v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 })}
            disabled={!canNext}
            className="p-2 rounded-xl hover:bg-slate-100 transition disabled:opacity-30">
            <ChevronRight size={18} strokeWidth={2} className="text-slate-600" />
          </button>
        </div>

        <div className="grid grid-cols-7 mb-2">
          {['一','二','三','四','五','六','日'].map(d => (
            <div key={d} className="text-center text-xs font-medium text-slate-400 py-1">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-1">
          {Array.from({ length: startDow }, (_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: totalDays }, (_, i) => {
            const d      = new Date(view.y, view.m, i + 1)
            const dStr   = format(d, 'yyyy-MM-dd')
            const isToday = isSameDay(d, today)
            const disabled = (d < minDate && !isToday) || d > maxDate
            return (
              <button
                key={i}
                disabled={disabled}
                onClick={() => onSelect(dStr)}
                className={cn(
                  'aspect-square flex items-center justify-center rounded-xl text-sm font-medium transition-all',
                  disabled  ? 'text-slate-200 cursor-not-allowed' :
                  isToday   ? 'bg-indigo-50 text-indigo-600 font-bold hover:bg-indigo-100' :
                              'text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 active:scale-95',
                )}
              >
                {i + 1}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Step 4: 選擇時段 ───────────────────────────────────────────────────

function Step4Time({ storeId, date, serviceId, practitionerId, selected, onSelect, onBack }: {
  storeId:          string
  date:             string
  serviceId:        string
  practitionerId:   string | null
  selected:         SlotItem | null
  onSelect:         (slot: SlotItem) => void
  onBack:           () => void
}) {
  const [slots, setSlots]     = useState<SlotItem[]>([])
  const [loading, setLoading] = useState(true)

  const fetchSlots = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.rpc('get_available_slots', {
      p_date:            date,
      p_service_id:      serviceId,
      p_practitioner_id: practitionerId,
      p_store_id:        storeId,
    })
    setSlots((data ?? []) as SlotItem[])
    setLoading(false)
  }, [storeId, date, serviceId, practitionerId])

  useEffect(() => { fetchSlots() }, [fetchSlots])

  const dateLabel = format(parseISO(date), 'M月d日（EEE）', { locale: zhTW })

  const morning   = slots.filter(s => parseInt(s.slot_time) < 12)
  const afternoon = slots.filter(s => parseInt(s.slot_time) >= 12 && parseInt(s.slot_time) < 17)
  const evening   = slots.filter(s => parseInt(s.slot_time) >= 17)

  function SlotGroup({ label, items }: { label: string; items: SlotItem[] }) {
    if (items.length === 0) return null
    return (
      <div className="mb-5">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{label}</p>
        <div className="grid grid-cols-3 gap-2">
          {items.map(slot => (
            <button
              key={`${slot.slot_time}-${slot.practitioner_id}`}
              onClick={() => onSelect(slot)}
              className={cn(
                'py-3.5 rounded-2xl border text-sm font-semibold transition-all active:scale-95',
                selected?.slot_time === slot.slot_time && selected?.practitioner_id === slot.practitioner_id
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:text-indigo-600',
              )}
            >
              <span className="tabular-nums">{slot.slot_time}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <BackButton onClick={onBack} />
      <h2 className="text-lg font-semibold text-slate-900 mb-1">選擇時段</h2>
      <p className="text-sm text-slate-400 mb-5">{dateLabel}</p>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : slots.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-100">
          <CalendarDays size={32} strokeWidth={1.5} className="mx-auto mb-3 text-slate-300" />
          <p className="font-medium text-slate-500">此日期無可預約時段</p>
          <p className="text-sm text-slate-400 mt-1">請返回選擇其他日期</p>
          <button onClick={onBack}
            className="mt-4 px-4 py-2 rounded-xl bg-indigo-50 text-indigo-600 text-sm font-medium hover:bg-indigo-100 transition">
            返回選擇日期
          </button>
        </div>
      ) : (
        <>
          <SlotGroup label="上午" items={morning} />
          <SlotGroup label="下午" items={afternoon} />
          <SlotGroup label="晚間" items={evening} />
        </>
      )}
    </div>
  )
}

// ── Step 5: 填寫資料 + 確認送出 ───────────────────────────────────────

function Step5Info({ draft, lineAvatar, onChange, onSubmit, onBack, submitting, error }: {
  draft:       BookingDraft
  lineAvatar:  string | null
  onChange:    (k: string, v: string) => void
  onSubmit:    () => void
  onBack:      () => void
  submitting:  boolean
  error:       string
}) {
  const [nameErr, setNameErr]   = useState('')
  const [phoneErr, setPhoneErr] = useState('')

  const canSubmit = draft.name.trim().length > 0 && draft.phone.trim().length >= 8

  const dateLabel = draft.date
    ? format(parseISO(draft.date), 'M月d日（EEE）', { locale: zhTW })
    : ''

  function validate() {
    let ok = true
    if (!draft.name.trim()) { setNameErr('請輸入姓名'); ok = false }
    if (draft.phone.trim().length < 8) { setPhoneErr('請輸入有效的電話號碼'); ok = false }
    if (ok) onSubmit()
  }

  return (
    <div>
      <BackButton onClick={onBack} />
      <h2 className="text-lg font-semibold text-slate-900 mb-1">確認預約資料</h2>
      <p className="text-sm text-slate-400 mb-5">請確認預約內容並填寫聯絡資料</p>

      {/* Summary card */}
      <div className="bg-indigo-50 rounded-2xl p-4 mb-5 space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <div className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold"
            style={{ backgroundColor: draft.slot?.practitioner_color ?? '#6366f1' }}>
            {draft.slot?.practitioner_name?.[0] ?? '?'}
          </div>
          <span className="font-medium text-slate-900">{draft.slot?.practitioner_name}</span>
        </div>
        <p className="text-sm text-indigo-700 font-semibold">{draft.service?.name}</p>
        <p className="text-sm text-slate-600 flex items-center gap-1.5">
          <Clock size={13} strokeWidth={1.5} className="text-indigo-400" />
          {dateLabel} {draft.slot?.slot_time}
          <span className="text-slate-400">（{draft.service?.duration_minutes} 分鐘）</span>
        </p>
      </div>

      {/* LINE 大頭照 */}
      {lineAvatar && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-100 rounded-2xl px-4 py-3 mb-4">
          <img src={lineAvatar} alt="LINE 頭像" className="w-10 h-10 rounded-full object-cover" />
          <div>
            <p className="text-xs text-green-700 font-medium">已連結 LINE 帳號</p>
            <p className="text-xs text-green-600">姓名已自動帶入，可視需要修改</p>
          </div>
        </div>
      )}

      {/* Form */}
      <div className="space-y-4">
        <FormField label="姓名" required error={nameErr}>
          <Input
            type="text"
            placeholder="請輸入您的姓名"
            value={draft.name}
            error={!!nameErr}
            onChange={e => { onChange('name', e.target.value); setNameErr('') }}
            disabled={submitting}
            prefix={<User size={15} strokeWidth={1.5} />}
            className="h-12 text-base"
          />
        </FormField>

        <FormField label="電話" required error={phoneErr}>
          <Input
            type="tel"
            placeholder="09xx-xxx-xxx"
            value={draft.phone}
            error={!!phoneErr}
            onChange={e => { onChange('phone', e.target.value); setPhoneErr('') }}
            disabled={submitting}
            prefix={<Phone size={15} strokeWidth={1.5} />}
            className="h-12 text-base"
          />
        </FormField>

        <FormField label="備註" hint="（選填）">
          <div className="relative">
            <MessageSquare size={15} strokeWidth={1.5} className="absolute left-3 top-3.5 text-slate-400 pointer-events-none" />
            <textarea
              value={draft.notes}
              onChange={e => onChange('notes', e.target.value)}
              rows={3}
              placeholder="如有特殊需求或想告知事項，請在此填寫"
              disabled={submitting}
              className="w-full pl-9 pr-3 py-3 rounded-2xl border border-slate-200 text-sm bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 focus:bg-white transition resize-none"
            />
          </div>
        </FormField>

        {error && (
          <div className="px-4 py-3 bg-red-50 rounded-2xl border border-red-200 text-sm text-red-600 flex items-center gap-2">
            <AlertCircle size={15} strokeWidth={1.5} className="shrink-0" />
            {error}
          </div>
        )}

        <Button
          variant="primary"
          className="w-full h-12 text-base"
          disabled={!canSubmit}
          loading={submitting}
          onClick={validate}
        >
          確認預約
        </Button>
      </div>
    </div>
  )
}

// ── Step 6: 預約成功 ───────────────────────────────────────────────────

function Step6Success({ store, draft, confirmedId, confirmedStatus, onRebook }: {
  store:            StoreInfo | null
  draft:            BookingDraft
  confirmedId:      string
  confirmedStatus:  'pending' | 'confirmed'
  onRebook:         () => void
}) {
  const dateLabel = draft.date
    ? format(parseISO(draft.date), 'yyyy 年 M 月 d 日（EEE）', { locale: zhTW })
    : ''

  const isPending = confirmedStatus === 'pending'

  return (
    <div className="flex flex-col items-center">
      <style>{`
        @keyframes pop-in {
          0%   { transform: scale(0);   opacity: 0; }
          70%  { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1);   opacity: 1; }
        }
        .pop-in { animation: pop-in 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards; }
        @keyframes ripple-out {
          0%   { transform: scale(1); opacity: 0.4; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        .ripple { animation: ripple-out 1.2s ease-out forwards; }
      `}</style>

      <div className="mt-4 mb-6 relative flex items-center justify-center">
        <div className={cn(
          'absolute w-20 h-20 rounded-full ripple',
          isPending ? 'bg-amber-200' : 'bg-green-200',
        )} />
        <div className={cn(
          'w-20 h-20 rounded-full flex items-center justify-center pop-in',
          isPending ? 'bg-amber-100' : 'bg-green-100',
        )}>
          <CheckCircle size={44} strokeWidth={1.5}
            className={isPending ? 'text-amber-500' : 'text-green-500'} />
        </div>
      </div>

      <h2 className="text-xl font-bold text-slate-900 mb-1">預約成功！</h2>

      {/* 狀態說明 */}
      <div className={cn(
        'px-4 py-2 rounded-full text-sm font-medium mb-5',
        isPending ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700',
      )}>
        {isPending ? '⏳ 待店家確認' : '✅ 已確認預約'}
      </div>

      {isPending && (
        <p className="text-xs text-slate-400 text-center mb-4 -mt-2">
          店家確認後您將收到通知，如急需確認請直接聯絡店家
        </p>
      )}

      {/* Confirmation card */}
      <div className="w-full bg-white rounded-3xl border border-slate-100 shadow-lg overflow-hidden">
        <div className={cn(
          'px-5 py-4 text-white',
          isPending ? 'bg-amber-500' : 'bg-indigo-600',
        )}>
          <p className="text-xs opacity-70 mb-0.5">{store?.name}</p>
          <p className="font-bold text-lg">{draft.service?.name}</p>
          <p className="text-sm opacity-80 mt-0.5">{draft.service?.duration_minutes} 分鐘</p>
        </div>

        <div className="px-5 py-4 space-y-3.5">
          <ConfirmRow label="日期時間">
            <p className="text-sm font-semibold text-slate-900">{dateLabel}</p>
            <p className="text-sm text-slate-600">{draft.slot?.slot_time} 開始</p>
          </ConfirmRow>
          <ConfirmRow label="從業人員">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                style={{ backgroundColor: draft.slot?.practitioner_color ?? '#6366f1' }}>
                {draft.slot?.practitioner_name?.[0]}
              </div>
              <span className="text-sm font-semibold text-slate-900">{draft.slot?.practitioner_name}</span>
            </div>
          </ConfirmRow>
          <ConfirmRow label="預約人">
            <p className="text-sm font-semibold text-slate-900">{draft.name}</p>
            <p className="text-sm text-slate-500">{draft.phone}</p>
          </ConfirmRow>
          {draft.notes && (
            <ConfirmRow label="備註">
              <p className="text-sm text-slate-600">{draft.notes}</p>
            </ConfirmRow>
          )}
        </div>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100">
          <p className="text-xs text-slate-400 text-center">
            預約編號：<span className="font-mono text-slate-500">{confirmedId.slice(0, 8).toUpperCase()}</span>
          </p>
        </div>
      </div>

      <p className="text-xs text-slate-400 mt-4 text-center">
        如需更改或取消預約，請直接聯絡店家
        {store?.phone && (
          <> <a href={`tel:${store.phone}`} className="text-indigo-500 font-medium ml-1">{store.phone}</a></>
        )}
      </p>

      <button
        onClick={onRebook}
        className="mt-5 w-full py-3.5 rounded-2xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 active:scale-[0.98] transition-all"
      >
        再預約一次
      </button>
    </div>
  )
}

// ── Shared ─────────────────────────────────────────────────────────────

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1 text-sm text-slate-400 hover:text-indigo-600 transition-colors mb-5 -ml-1 min-h-[44px]">
      <ChevronLeft size={18} strokeWidth={2} />
      返回
    </button>
  )
}

function ConfirmRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <p className="text-xs text-slate-400 font-medium w-16 shrink-0 pt-0.5">{label}</p>
      <div className="flex-1">{children}</div>
    </div>
  )
}
