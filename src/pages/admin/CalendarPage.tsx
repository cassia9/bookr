/**
 * CalendarPage — 行事曆預約管理
 * - 預約卡片以老師顏色呈現
 * - 點擊卡片開啟可編輯 Modal（auto-save）
 * - 狀態操作：確認 / 完課 / 未到場 / 取消（取消需確認彈窗）
 * - cancelled 不顯示在行事曆；completed 顯示但較淡
 * - 所有登入用戶皆可編輯
 */
import { useCallback, useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Phone, Clock, AlertTriangle, Plus, ArrowRight, Check, Repeat2, TicketCheck, Undo2, X as XIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { getEligibleClientVoucherItems } from '@/lib/vouchers-api'
import type { EligibleVoucherItem } from '@/lib/vouchers-api'
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
import Alert from '@/components/ui/Alert'
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

interface VoucherRedemption {
  id: string
  client_voucher_item_id: string
  status: 'reserved' | 'redeemed' | 'released'
  created_at: string
  client_voucher_item: {
    id: string
    service_name_snapshot: string
    client_voucher: {
      product_name_snapshot: string
    } | null
  } | null
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
  recurrence_series_id: string | null
  recurrence_occurrence_index: number | null
  client: { id: string; full_name: string; phone: string } | null
  practitioner: { id: string; full_name: string; color: string | null } | null
  service: { id: string; name: string; duration_minutes: number; price: number } | null
  voucher_redemptions: VoucherRedemption[]
}

type ViewMode = 'month' | 'week' | 'day'

interface CalendarPageProps {
  selectedPractitionerId?: string | null
  defaultView?: ViewMode
  defaultDate?: Date
  startHour?: number
  endHour?: number
  onNewBooking?: (date: Date, time?: string) => void
  onCalendarViewChange?: (view: ViewMode) => void
  onCalendarDateChange?: (date: Date) => void
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

const VOUCHER_STATUS_LABEL: Record<VoucherRedemption['status'], string> = {
  reserved: '已保留 1 堂',
  redeemed: '已扣除 1 堂',
  released: '已釋放',
}

function getActiveVoucherUsage(booking: Booking): VoucherRedemption | null {
  return booking.voucher_redemptions.find(redemption =>
    redemption.status === 'reserved' || redemption.status === 'redeemed'
  ) ?? null
}

function getDisplayVoucherUsage(booking: Booking): VoucherRedemption | null {
  return getActiveVoucherUsage(booking) ?? booking.voucher_redemptions[0] ?? null
}

// ── 主元件 ────────────────────────────────────────────────────────────────────

export default function CalendarPage({
  selectedPractitionerId,
  defaultView = 'week',
  defaultDate,
  startHour = 9,
  endHour = 21,
  onNewBooking,
  onCalendarViewChange,
  onCalendarDateChange,
}: CalendarPageProps) {
  const [fallbackDate] = useState(() => new Date())
  const view = defaultView
  const currentDate = defaultDate ?? fallbackDate
  const [bookings, setBookings] = useState<Booking[]>([])
  const [practitioners, setPractitioners] = useState<Practitioner[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [bookingsError, setBookingsError] = useState('')
  const [metaError, setMetaError] = useState('')

  // Modal 狀態
  const [modalBooking, setModalBooking] = useState<Booking | null>(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [showReopenConfirm, setShowReopenConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [voucherSaving, setVoucherSaving] = useState(false)
  const [voucherChoice, setVoucherChoice] = useState('none')
  const [voucherOptions, setVoucherOptions] = useState<EligibleVoucherItem[]>([])

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

  // ── 日期範圍計算 ─────────────────────────────────────────────────────────────

  const getDateRange = useCallback((): { start: Date; end: Date } => {
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
  }, [currentDate, view])

  // ── 資料抓取 ────────────────────────────────────────────────────────────────

  const fetchMeta = useCallback(async () => {
    const [{ data: p, error: practitionerError }, { data: s, error: serviceError }] = await Promise.all([
      supabase.from('practitioners').select('id, full_name, color')
        .eq('store_id', STORE_ID).eq('active', true).is('deleted_at', null),
      supabase.from('services').select('id, name, duration_minutes, price')
        .eq('store_id', STORE_ID).eq('active', true),
    ])

    if (practitionerError || serviceError) {
      console.error('載入行事曆基本資料失敗', practitionerError ?? serviceError)
      setMetaError('老師或課程資料暫時無法載入，請重新整理後再試。')
      return
    }

    setMetaError('')
    setPractitioners(p ?? [])
    setServices(s ?? [])
  }, [])

  const fetchBookings = useCallback(async () => {
    setIsLoading(true)
    setBookingsError('')
    const { start, end } = getDateRange()

    let query = supabase
      .from('bookings')
      .select(`
        id, client_id, practitioner_id, service_id,
        start_time, end_time, status, notes, price, buffer_minutes,
        recurrence_series_id, recurrence_occurrence_index,
        client:clients(id, full_name, phone),
        practitioner:practitioners(id, full_name, color),
        service:services(id, name, duration_minutes, price),
        voucher_redemptions(
          id, client_voucher_item_id, status, created_at,
          client_voucher_item:client_voucher_items(
            id, service_name_snapshot,
            client_voucher:client_vouchers(product_name_snapshot)
          )
        )
      `)
      .eq('store_id', STORE_ID)
      .gte('start_time', start.toISOString())
      .lte('start_time', end.toISOString())
      .order('start_time')
      .order('created_at', { referencedTable: 'voucher_redemptions', ascending: false })
      .limit(1, { referencedTable: 'voucher_redemptions' })

    if (selectedPractitionerId) {
      query = query.eq('practitioner_id', selectedPractitionerId)
    }

    const { data, error } = await query
    if (error) {
      console.error('載入行事曆預約失敗', error)
      setBookings([])
      setBookingsError('預約資料暫時無法載入，請重新整理後再試。')
    } else {
      setBookings((data ?? []) as unknown as Booking[])
    }
    setIsLoading(false)
  }, [getDateRange, selectedPractitionerId])

  useEffect(() => { void Promise.resolve().then(fetchMeta) }, [fetchMeta])
  useEffect(() => { void Promise.resolve().then(fetchBookings) }, [fetchBookings])

  function retryLoading() {
    void fetchMeta()
    void fetchBookings()
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
    setShowReopenConfirm(false)
    const activeVoucher = getActiveVoucherUsage(booking)
    setVoucherChoice(activeVoucher?.client_voucher_item_id ?? 'none')
    void loadVoucherOptions(booking)
  }

  function closeModal() {
    setModalBooking(null)
    setShowCancelConfirm(false)
    setShowReopenConfirm(false)
    if (notesTimer.current) clearTimeout(notesTimer.current)
  }

  async function loadVoucherOptions(
    booking: Booking,
    serviceId = booking.service_id,
    bookingDate = format(parseISO(booking.start_time), 'yyyy-MM-dd'),
  ) {
    try {
      const eligible = await getEligibleClientVoucherItems(booking.client_id, serviceId, bookingDate)
      setVoucherOptions(eligible)
    } catch (error) {
      console.error('載入可用商品券失敗', error)
      setVoucherOptions([])
    }
  }

  async function refreshBookingVoucher(bookingId: string, baseOverride?: Booking): Promise<Booking | null> {
    const { data, error } = await supabase
      .from('bookings')
      .select(`
        voucher_redemptions(
          id, client_voucher_item_id, status, created_at,
          client_voucher_item:client_voucher_items(
            id, service_name_snapshot,
            client_voucher:client_vouchers(product_name_snapshot)
          )
        )
      `)
      .eq('id', bookingId)
      .order('created_at', { referencedTable: 'voucher_redemptions', ascending: false })
      .limit(1, { referencedTable: 'voucher_redemptions' })
      .single()

    if (error) {
      console.error('更新預約商品券狀態失敗', error)
      return null
    }

    const baseBooking = baseOverride ?? (modalBooking?.id === bookingId
      ? modalBooking
      : bookings.find(booking => booking.id === bookingId))
    if (!baseBooking) return null

    const nextBooking: Booking = {
      ...baseBooking,
      voucher_redemptions: (data.voucher_redemptions ?? []) as unknown as VoucherRedemption[],
    }
    setBookings(current => current.map(booking => booking.id === bookingId ? nextBooking : booking))
    setModalBooking(current => current?.id === bookingId ? nextBooking : current)
    return nextBooking
  }

  async function handleVoucherChoice(nextChoice: string) {
    if (!modalBooking || voucherSaving || nextChoice === voucherChoice) return

    setVoucherSaving(true)
    const useVoucher = nextChoice !== 'none'
    const selectedItemId = nextChoice === 'auto' || nextChoice === 'none' ? null : nextChoice
    const { data, error } = await supabase.rpc('set_booking_voucher', {
      p_booking_id: modalBooking.id,
      p_use_voucher: useVoucher,
      p_client_voucher_item_id: selectedItemId,
    })

    if (error) {
      setVoucherSaving(false)
      toast.error(
        '商品券更新失敗',
        error.message.includes('VOUCHER_NOT_ELIGIBLE') ? '此商品券已不適用或餘額不足' : error.message,
      )
      return
    }

    const result = data as { ok?: boolean; error?: string }
    if (!result?.ok) {
      setVoucherSaving(false)
      toast.error('商品券更新失敗', result?.error ?? '未知錯誤')
      return
    }

    const refreshed = await refreshBookingVoucher(modalBooking.id)
    const activeVoucher = refreshed ? getActiveVoucherUsage(refreshed) : null
    setVoucherChoice(activeVoucher?.client_voucher_item_id ?? 'none')
    if (refreshed) await loadVoucherOptions(refreshed)
    setVoucherSaving(false)
    toast.success(useVoucher ? '商品券已套用' : '本次預約已改為不使用商品券')
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

    const result = data as {
      ok: boolean
      error?: string
      conflict?: { client_name: string; service_name: string }
    }
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
    const updatedBooking: Booking = {
      ...modalBooking,
      practitioner_id: pId,
      service_id:      sId,
      start_time:      start.toISOString(),
      end_time:        end.toISOString(),
      price,
      notes:           notes.trim() || null,
      practitioner:    newPractitioner
        ? { id: newPractitioner.id, full_name: newPractitioner.full_name, color: newPractitioner.color }
        : modalBooking.practitioner,
      service: svc
        ? { id: svc.id, name: svc.name, duration_minutes: svc.duration_minutes, price: svc.price }
        : modalBooking.service,
    }
    setBookings(prev => prev.map(b => b.id !== modalBooking.id ? b : {
      ...b,
      ...updatedBooking,
    }))

    // 更新 modalBooking 同步
    setModalBooking(updatedBooking)

    const refreshed = await refreshBookingVoucher(modalBooking.id, updatedBooking)
    if (refreshed) {
      const activeVoucher = getActiveVoucherUsage(refreshed)
      setVoucherChoice(activeVoucher?.client_voucher_item_id ?? 'none')
      await loadVoucherOptions(refreshed, sId, date)
    }
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
    }
    labelMap[status]?.()

    setBookings(prev => prev.map(b =>
      b.id === modalBooking.id ? { ...b, status: status as Booking['status'] } : b
    ))
    setModalBooking(prev => prev ? { ...prev, status: status as Booking['status'] } : null)
    setShowCancelConfirm(false)
    await refreshBookingVoucher(modalBooking.id, {
      ...modalBooking,
      status: status as Booking['status'],
    })
  }

  async function handleCancel(scope: 'single' | 'future') {
    if (!modalBooking) return
    setSaving(true)
    const { data, error } = await supabase.rpc('cancel_booking_scope', {
      p_booking_id: modalBooking.id,
      p_scope: scope,
    })
    setSaving(false)

    if (error) {
      toast.error('取消失敗', error.message)
      return
    }

    const result = data as { ok?: boolean; error?: string; affected_count?: number }
    if (!result?.ok) {
      const message: Record<string, string> = {
        BOOKING_ALREADY_STARTED: '已開始的預約不能批次取消',
        NO_FUTURE_BOOKINGS: '本次之後沒有可取消的預約',
      }
      toast.error('取消失敗', message[result?.error ?? ''] ?? result?.error ?? '未知錯誤')
      return
    }

    toast.info(
      scope === 'future' ? '已取消本次及之後的預約' : '已取消本次預約',
      scope === 'future' ? `共取消 ${result.affected_count ?? 0} 堂` : undefined,
    )
    closeModal()
    await fetchBookings()
  }

  async function handleReopenCompleted() {
    if (!modalBooking || modalBooking.status !== 'completed') return

    const booking = modalBooking
    setSaving(true)
    const { data, error } = await supabase.rpc('reopen_completed_booking', {
      p_booking_id: booking.id,
    })

    if (error) {
      setSaving(false)
      toast.error('無法修正完課狀態', error.message)
      return
    }

    const result = data as { ok?: boolean; error?: string; voucher_restored?: boolean }
    if (!result?.ok) {
      const errorMessage: Record<string, string> = {
        FORBIDDEN: '目前帳號沒有修正完課狀態的權限',
        BOOKING_NOT_FOUND: '找不到這筆預約，請重新整理後再試',
        BOOKING_NOT_COMPLETED: '這筆預約已不是完課狀態',
      }
      setSaving(false)
      toast.error('無法修正完課狀態', errorMessage[result?.error ?? ''] ?? '請稍後再試')
      return
    }

    const updatedBooking: Booking = { ...booking, status: 'confirmed' }
    setBookings(current => current.map(item => item.id === booking.id ? updatedBooking : item))
    setModalBooking(updatedBooking)
    setShowReopenConfirm(false)

    const refreshed = await refreshBookingVoucher(booking.id, updatedBooking)
    if (refreshed) {
      const activeVoucher = getActiveVoucherUsage(refreshed)
      setVoucherChoice(activeVoucher?.client_voucher_item_id ?? 'none')
      await loadVoucherOptions(refreshed)
    }

    setSaving(false)
    toast.success(
      '完課狀態已修正',
      result.voucher_restored ? '預約已恢復為已確認，商品券 1 堂已恢復保留' : '預約已恢復為已確認，可重新編輯',
    )
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

  const isToday = (d: Date) =>
    d.toDateString() === new Date().toDateString()

  // 全部（含 cancelled），用於月視圖 badge 統計與 popover
  const allBookingsOnDate = (d: Date) =>
    bookings.filter(b => new Date(b.start_time).toDateString() === d.toDateString())

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

  function openTimeCell(
    date: Date,
    hour: number,
    event: React.MouseEvent<HTMLDivElement>,
  ) {
    if (!onNewBooking || (event.target as HTMLElement).closest('button')) return
    const rect = event.currentTarget.getBoundingClientRect()
    const relativeY = Math.max(0, Math.min(rect.height - 1, event.clientY - rect.top))
    const minute = Math.min(45, Math.floor((relativeY / rect.height) * 4) * 15)
    onNewBooking(
      date,
      `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    )
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
        {(metaError || bookingsError) && (
          <Alert variant="error" title="行事曆載入失敗" className="mb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{bookingsError || metaError}</span>
              <Button type="button" variant="secondary" size="sm" onClick={retryLoading}>
                重新載入
              </Button>
            </div>
          </Alert>
        )}

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-black" />
          </div>
        ) : bookingsError ? null : (
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
                          if (e.target !== e.currentTarget && !(e.target as HTMLElement).closest('[data-calendar-day-number]')) return
                          onNewBooking?.(date)
                        }}
                        className={cn(
                          'min-h-20 p-2 rounded-xl border transition-colors',
                          onNewBooking ? 'cursor-pointer' : '',
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
                          )} data-calendar-day-number>
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
                {Array.from({ length: 24 }, (_, hour) => hour).map(hour => (
                  <div key={hour} className="grid border-b border-slate-50 min-h-16"
                    style={{ gridTemplateColumns: '64px repeat(7, 1fr)' }}>
                    <div className={cn(
                      'text-right pr-3 pt-2 text-xs border-r border-slate-100 shrink-0',
                      hour < startHour || hour >= endHour ? 'bg-slate-50 text-slate-300' : 'text-slate-400',
                    )}>
                      {String(hour).padStart(2, '0')}:00
                      {(hour === startHour - 1 || hour === endHour) && (
                        <div className="text-[9px] text-slate-300">營業外</div>
                      )}
                    </div>
                    {datesForView.map(date => {
                      const hBk = bookingsOnHour(date, hour)
                      const dateStr = format(date, 'yyyy-MM-dd')
                      const isDropTarget = dropTarget?.date === dateStr && dropTarget?.hour === hour
                      return (
                        <div key={date.toISOString()}
                          className={cn(
                            'px-1 py-1 border-r border-slate-100 space-y-0.5 transition-colors cursor-crosshair',
                            (hour < startHour || hour >= endHour) && 'bg-slate-50/70',
                            isToday(date) && 'bg-indigo-50/20',
                            isDropTarget && 'bg-indigo-100/60 ring-1 ring-inset ring-indigo-300',
                          )}
                          onClick={event => openTimeCell(date, hour, event)}
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
                {Array.from({ length: 24 }, (_, hour) => hour).map(hour => {
                  const hBk = bookingsOnHour(currentDate, hour)
                  const dateStr = format(currentDate, 'yyyy-MM-dd')
                  const isDropTarget = dropTarget?.date === dateStr && dropTarget?.hour === hour
                  return (
                    <div key={hour}
                      className={cn(
                        'flex gap-3 px-4 py-2 border-b border-slate-50 min-h-14 transition-colors',
                        (hour < startHour || hour >= endHour) && 'bg-slate-50/70',
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
                      <div className="w-12 text-right text-xs text-slate-300 pt-1 shrink-0">
                        {String(hour).padStart(2, '0')}:00
                      </div>
                      <div
                        className="flex-1 flex flex-wrap gap-2 cursor-crosshair"
                        onClick={event => openTimeCell(currentDate, hour, event)}
                      >
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
                <p className="text-sm font-semibold">
                  {modalBooking.recurrence_series_id ? '要取消哪些循環預約？' : '確認取消此預約？'}
                </p>
              </div>
              <p className="text-xs leading-5 text-red-400">
                {modalBooking.recurrence_series_id
                  ? '可只取消本次，或取消本次及之後尚未開始的預約；已完課與未到場紀錄不受影響。'
                  : '取消後此預約將從行事曆移除（客戶紀錄仍保留）。'}
              </p>
              {modalBooking.recurrence_series_id ? (
                <div className="space-y-2">
                  <Button variant="danger" className="w-full" loading={saving} onClick={() => handleCancel('single')}>
                    只取消本次
                  </Button>
                  <Button variant="secondary" className="w-full border-red-200 text-red-600 hover:bg-red-50" disabled={saving} onClick={() => handleCancel('future')}>
                    取消本次及之後的預約
                  </Button>
                  <Button variant="ghost" className="w-full" disabled={saving} onClick={() => setShowCancelConfirm(false)}>
                    返回
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button variant="secondary" className="flex-1" onClick={() => setShowCancelConfirm(false)}>
                    返回
                  </Button>
                  <Button variant="danger" className="flex-1" loading={saving} onClick={() => handleCancel('single')}>
                    確認取消
                  </Button>
                </div>
              )}
            </div>
          ) : showReopenConfirm ? (
            /* 撤銷完課確認 */
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-amber-700">
                <Undo2 size={15} />
                <p className="text-sm font-semibold">確認修正完課狀態？</p>
              </div>
              <p className="text-xs leading-5 text-slate-500">
                預約會恢復為已確認並重新開放編輯；若已扣商品券，1 堂會一併恢復為保留。
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => setShowReopenConfirm(false)}>
                  返回
                </Button>
                <Button className="flex-1" loading={saving} onClick={handleReopenCompleted}>
                  確認修正
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
              {modalBooking.status === 'completed' && (
                <Button
                  variant="secondary"
                  className="w-full border-0 bg-amber-50 text-amber-800 hover:bg-amber-100"
                  onClick={() => setShowReopenConfirm(true)}
                >
                  <Undo2 size={15} />
                  修正完課狀態
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
              {modalBooking.recurrence_series_id && (
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-600">
                  <Repeat2 size={12} />
                  循環預約
                  {modalBooking.recurrence_occurrence_index
                    ? ` · 第 ${modalBooking.recurrence_occurrence_index} 堂`
                    : ''}
                </span>
              )}
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

            {/* 本次預約使用的商品券 */}
            {(() => {
              const activeVoucher = getActiveVoucherUsage(modalBooking)
              const displayVoucher = getDisplayVoucherUsage(modalBooking)
              const productName = displayVoucher?.client_voucher_item?.client_voucher?.product_name_snapshot
              const serviceName = displayVoucher?.client_voucher_item?.service_name_snapshot
              const activeVoucherInOptions = activeVoucher
                ? voucherOptions.some(option => option.itemId === activeVoucher.client_voucher_item_id)
                : true
              const selectOptions: SelectOption[] = [
                ...(voucherOptions.length > 0 || activeVoucher
                  ? [{ value: 'auto', label: '自動使用最適合的商品券' }]
                  : []),
                { value: 'none', label: '本次不使用商品券' },
                ...(!activeVoucherInOptions && activeVoucher
                  ? [{
                      value: activeVoucher.client_voucher_item_id,
                      label: `${productName ?? '目前商品券'} · 目前使用中`,
                    }]
                  : []),
                ...voucherOptions.map(option => ({
                  value: option.itemId,
                  label: `${option.productName} · 可用 ${option.availableQuantity} 堂`,
                })),
              ]
              const isReleased = displayVoucher?.status === 'released'

              return (
                <div className={cn(
                  'rounded-2xl border px-4 py-3.5',
                  activeVoucher
                    ? 'border-lime-200 bg-lime-50/80'
                    : isReleased
                    ? 'border-stone-200 bg-stone-50'
                    : 'border-slate-200 bg-white',
                )}>
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl',
                      activeVoucher ? 'bg-lime-200/70 text-lime-800' : 'bg-slate-100 text-slate-500',
                    )}>
                      <TicketCheck size={17} strokeWidth={1.8} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold tracking-wide text-slate-500">本次商品券</p>
                        {displayVoucher && (
                          <span className={cn(
                            'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                            activeVoucher ? 'bg-lime-200 text-lime-900' : 'bg-stone-200 text-stone-600',
                          )}>
                            {VOUCHER_STATUS_LABEL[displayVoucher.status]}
                          </span>
                        )}
                      </div>

                      {displayVoucher ? (
                        <div className="mt-1.5">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {productName ?? '商品券'}
                          </p>
                          {serviceName && <p className="mt-0.5 text-xs text-slate-500">對應課程：{serviceName}</p>}
                          {isReleased && (
                            <p className="mt-1 text-xs text-stone-500">目前未使用商品券；先前保留的堂數已退回。</p>
                          )}
                        </div>
                      ) : (
                        <p className="mt-1.5 text-sm text-slate-600">本次未使用商品券。</p>
                      )}
                    </div>
                  </div>

                  {isEditable(modalBooking.status) && (
                    <div className="mt-3 border-t border-black/5 pt-3">
                      <label className="mb-1.5 block text-xs font-medium text-slate-500">更改使用方式</label>
                      <Select
                        value={voucherChoice}
                        onChange={value => void handleVoucherChoice(value)}
                        options={selectOptions}
                        disabled={voucherSaving || saving}
                      />
                      {voucherSaving && <p className="mt-1.5 text-xs text-slate-400 animate-pulse">更新商品券中…</p>}
                    </div>
                  )}
                </div>
              )
            })()}

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
                    <TimePicker value={editTime} onChange={handleTimeChange} startHour={0} endHour={23} />
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
                  onClick={() => {
                    onCalendarViewChange?.('day')
                    onCalendarDateChange?.(dayPopover.date)
                    setDayPopover(null)
                  }}
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
