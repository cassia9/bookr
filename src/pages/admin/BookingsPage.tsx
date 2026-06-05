/**
 * 預約管理 — 統一頁面
 * 整合「行事曆」（react-big-calendar + DnD）與「甘特圖」（自製 + HTML5 DnD）
 * 共用 date、selectedEvent、以及所有 CRUD 操作
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Calendar, dateFnsLocalizer } from 'react-big-calendar'
import _withDnD from 'react-big-calendar/lib/addons/dragAndDrop'
import type { EventInteractionArgs } from 'react-big-calendar/lib/addons/dragAndDrop'
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css'

// CJS interop: Vite 有時將 default export 包在 .default 內
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const withDragAndDrop: typeof _withDnD = (_withDnD as any).default ?? _withDnD
import {
  format, parse, startOfWeek, getDay,
  startOfMonth, endOfMonth,
  startOfWeek as startOfWk, endOfWeek,
  addDays, addWeeks, subDays, subWeeks, addMonths, subMonths, isSameDay,
} from 'date-fns'
import { zhTW } from 'date-fns/locale/zh-TW'
import {
  CalendarRange, Plus, X, Phone, Clock,
  CheckCircle, XCircle, AlertCircle, Pencil,
  ChevronLeft, ChevronRight, GripVertical,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import NewBookingModal, { nearestSlot } from '../../components/booking/NewBookingModal'
import { cn } from '../../lib/cn'
import { toast } from '../../components/ui/Snackbar'
import type { Practitioner, Client, Service, PractitionerBlock } from '../../types/database'

const STORE_ID = '00000000-0000-0000-0000-000000000001'
const HOURS = Array.from({ length: 14 }, (_, i) => i + 8) // 08:00–21:00
const HOUR_WIDTH = 80 // px per hour

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales: { 'zh-TW': zhTW },
})

// DnD-enhanced Calendar — created once at module level
const DnDCalendar = withDragAndDrop<CalEvent>(Calendar)

const STATUS_LABEL: Record<string, string> = {
  pending: '待確認', confirmed: '已確認', completed: '已完課',
  cancelled: '已取消', no_show: '未到場',
}
const STATUS_COLOR: Record<string, string> = {
  pending:   'bg-amber-100 text-amber-700',
  confirmed: 'bg-blue-100  text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-slate-100 text-slate-500',
  no_show:   'bg-red-100   text-red-500',
}
const GANTT_COLOR: Record<string, string> = {
  pending:   '#f59e0b',
  confirmed: '#6366f1',
  completed: '#22c55e',
  cancelled: '#94a3b8',
  no_show:   '#ef4444',
}

interface CalEvent {
  id: string
  title: string
  start: Date
  end: Date
  resource: {
    /** undefined / 'booking' = real booking; 'buffer' = phantom buffer block; 'block' = practitioner block */
    type?: 'booking' | 'buffer' | 'block'
    status: string
    practitioner: Practitioner | null
    client: Client | null
    service_id: string
    service: { name: string; duration_minutes: number; price: number } | null
    notes: string | null
    buffer_minutes: number
    price: number
  }
}

/** 拖曳確認資料 */
interface DragConfirm {
  event: CalEvent
  newStart: Date
  newEnd: Date
  newPractitionerId: string
}

type PageMode    = 'calendar' | 'gantt'
type CalViewMode = 'month' | 'week' | 'day'
type GanttMode   = 'day' | 'week'

function roundToSlot(d: Date): string {
  const h = d.getHours(), m = d.getMinutes()
  if (h < 8)  return '08:00'
  if (h > 21 || (h === 21 && m > 0)) return '21:00'
  const rounded = Math.round(m / 15) * 15
  const finalM  = rounded >= 60 ? 0 : rounded
  const finalH  = rounded >= 60 ? Math.min(h + 1, 21) : h
  return `${String(finalH).padStart(2, '0')}:${String(finalM).padStart(2, '0')}`
}

export default function BookingsPage() {
  // ── Mode ─────────────────────────────────────────────────────────
  const [pageMode,  setPageMode]  = useState<PageMode>('calendar')
  const [calView,   setCalView]   = useState<CalViewMode>('week')
  const [ganttMode, setGanttMode] = useState<GanttMode>('day')

  // ── Shared ───────────────────────────────────────────────────────
  const [date,    setDate]    = useState(new Date())
  const [loading, setLoading] = useState(false)
  const [events,  setEvents]  = useState<CalEvent[]>([])
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null)

  // ── CRUD ─────────────────────────────────────────────────────────
  const [cancelTarget,       setCancelTarget]       = useState<CalEvent | null>(null)
  const [editTarget,         setEditTarget]         = useState<CalEvent | null>(null)
  const [newBookingOpen,     setNewBookingOpen]     = useState(false)
  const [slotDate,           setSlotDate]           = useState<string | undefined>()
  const [slotTime,           setSlotTime]           = useState<string | undefined>()
  const [slotPractitionerId, setSlotPractitionerId] = useState<string | undefined>()

  // ── DnD ──────────────────────────────────────────────────────────
  const [draggingEvent, setDraggingEvent] = useState<CalEvent | null>(null)
  const [dragOverRow,   setDragOverRow]   = useState<string | null>(null) // practitioner id
  const [dragConfirm,   setDragConfirm]   = useState<DragConfirm | null>(null)
  const [dragSaving,    setDragSaving]    = useState(false)

  // ── Meta ─────────────────────────────────────────────────────────
  const [practitioners,       setPractitioners]       = useState<Practitioner[]>([])
  const [clients,             setClients]             = useState<Client[]>([])
  const [services,            setServices]            = useState<Service[]>([])
  const [defaultBufferMinutes, setDefaultBufferMinutes] = useState(0)
  const [storeOpenTime,       setStoreOpenTime]       = useState('09:00')
  const [storeCloseTime,      setStoreCloseTime]      = useState('21:00')
  const [practitionerBlocks,  setPractitionerBlocks]  = useState<PractitionerBlock[]>([])

  useEffect(() => { fetchMeta() }, [])
  useEffect(() => { fetchBookings(); fetchBlocks() }, [date, pageMode, calView, ganttMode])

  async function fetchMeta() {
    const [{ data: p }, { data: c }, { data: s }, { data: store }] = await Promise.all([
      supabase.from('practitioners').select('*').eq('store_id', STORE_ID).eq('active', true),
      supabase.from('clients').select('*').eq('store_id', STORE_ID).order('full_name'),
      supabase.from('services').select('*').eq('store_id', STORE_ID).eq('active', true),
      supabase.from('stores')
        .select('default_buffer_minutes, open_time, close_time')
        .eq('id', STORE_ID).single(),
    ])
    setPractitioners(p ?? [])
    setClients(c ?? [])
    setServices(s ?? [])
    const storeData = store as any
    setDefaultBufferMinutes(storeData?.default_buffer_minutes ?? 30)
    // PostgreSQL TIME type returns "HH:MM:SS" – take only "HH:MM"
    setStoreOpenTime((storeData?.open_time  ?? '09:00:00').slice(0, 5))
    setStoreCloseTime((storeData?.close_time ?? '21:00:00').slice(0, 5))
  }

  async function fetchBookings() {
    setLoading(true)
    let start: Date, end: Date

    if (pageMode === 'calendar') {
      if (calView === 'month') {
        start = startOfMonth(date); end = endOfMonth(date)
      } else if (calView === 'week') {
        start = startOfWk(date, { weekStartsOn: 1 }); end = endOfWeek(date, { weekStartsOn: 1 })
      } else {
        start = new Date(date); start.setHours(0, 0, 0, 0)
        end   = new Date(date); end.setHours(23, 59, 59, 999)
      }
    } else {
      if (ganttMode === 'day') {
        start = new Date(date); start.setHours(0, 0, 0, 0)
        end   = new Date(date); end.setHours(23, 59, 59, 999)
      } else {
        start = startOfWk(date, { weekStartsOn: 1 })
        end   = endOfWeek(date, { weekStartsOn: 1 })
      }
    }

    const { data, error } = await supabase
      .from('bookings')
      .select('*, client:clients(*), practitioner:practitioners(*), service:services(name,duration_minutes,price)')
      .eq('store_id', STORE_ID)
      .gte('start_time', start.toISOString())
      .lte('start_time', end.toISOString())
      .neq('status', 'cancelled')

    if (error) { setLoading(false); return }

    setEvents((data ?? []).map((b: any) => ({
      id: b.id,
      title: `${b.client?.full_name ?? '—'} · ${b.service?.name ?? '—'}`,
      start: new Date(b.start_time),
      end:   new Date(b.end_time),
      resource: {
        status:         b.status,
        practitioner:   b.practitioner,
        client:         b.client,
        service_id:     b.service_id,
        service:        b.service,
        notes:          b.notes,
        buffer_minutes: b.buffer_minutes ?? 0,
        price:          b.price ?? 0,
      },
    })))
    setLoading(false)
  }

  async function fetchBlocks() {
    let start: Date, end: Date
    if (pageMode === 'calendar') {
      if (calView === 'month') {
        start = startOfMonth(date); end = endOfMonth(date)
      } else if (calView === 'week') {
        start = startOfWk(date, { weekStartsOn: 1 }); end = endOfWeek(date, { weekStartsOn: 1 })
      } else {
        start = new Date(date); start.setHours(0, 0, 0, 0)
        end   = new Date(date); end.setHours(23, 59, 59, 999)
      }
    } else {
      if (ganttMode === 'day') {
        start = new Date(date); start.setHours(0, 0, 0, 0)
        end   = new Date(date); end.setHours(23, 59, 59, 999)
      } else {
        start = startOfWk(date, { weekStartsOn: 1 })
        end   = endOfWeek(date, { weekStartsOn: 1 })
      }
    }
    const { data } = await supabase
      .from('practitioner_blocks')
      .select('*')
      .eq('store_id', STORE_ID)
      .lt('start_time', end.toISOString())
      .gt('end_time', start.toISOString())
      .order('start_time')
    setPractitionerBlocks(data ?? [])
  }

  // ── Calendar helpers ──────────────────────────────────────────────
  function calNavigate(dir: number) {
    if (calView === 'month') setDate(d => dir > 0 ? addMonths(d, 1) : subMonths(d, 1))
    else if (calView === 'week') setDate(d => dir > 0 ? addWeeks(d, 1) : subWeeks(d, 1))
    else setDate(d => dir > 0 ? addDays(d, 1) : subDays(d, 1))
  }

  const calTitle = (() => {
    if (calView === 'month') return format(date, 'yyyy年 M月', { locale: zhTW })
    if (calView === 'week') {
      const ws = startOfWk(date, { weekStartsOn: 1 })
      const we = endOfWeek(date, { weekStartsOn: 1 })
      return `${format(ws, 'M/d', { locale: zhTW })} – ${format(we, 'M/d', { locale: zhTW })}`
    }
    return format(date, 'yyyy年 M月 d日 (EEEE)', { locale: zhTW })
  })()

  const eventStyleGetter = useCallback((event: CalEvent) => {
    if (event.resource.type === 'buffer') {
      return {
        style: {
          backgroundColor: '#e2e8f0',
          backgroundImage: 'repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(255,255,255,0.55) 4px,rgba(255,255,255,0.55) 8px)',
          borderRadius: '4px',
          border: 'none',
          opacity: 0.8,
          color: '#94a3b8',
          fontSize: '11px',
          cursor: 'pointer',
        },
      }
    }
    if (event.resource.type === 'block') {
      return {
        style: {
          backgroundColor: '#fecaca',
          backgroundImage: 'repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(255,255,255,0.4) 4px,rgba(255,255,255,0.4) 8px)',
          borderRadius: '4px',
          border: '1px solid #fca5a5',
          color: '#dc2626',
          fontSize: '11px',
          cursor: 'default',
        },
      }
    }
    // 已完課 → 灰階
    if (event.resource.status === 'completed') {
      return {
        style: {
          backgroundColor: '#94a3b8',
          borderRadius: '6px',
          border: 'none',
          opacity: 0.65,
        },
      }
    }
    // 已取消 / 未到場 → 更淡
    if (['cancelled', 'no_show'].includes(event.resource.status)) {
      return {
        style: {
          backgroundColor: '#cbd5e1',
          borderRadius: '6px',
          border: 'none',
          opacity: 0.5,
        },
      }
    }
    return {
      style: {
        backgroundColor: event.resource.practitioner?.color ?? '#6366f1',
        borderRadius: '6px',
        border: 'none',
      },
    }
  }, [])

  const draggableAccessor = useCallback(
    (event: CalEvent) =>
      !event.resource.type && ['pending', 'confirmed'].includes(event.resource.status),
    []
  )

  function handleSelectSlot({ start }: { start: Date }) {
    const d = format(start, 'yyyy-MM-dd')
    const t = start.getHours() === 0 ? nearestSlot() : roundToSlot(start)
    setSlotDate(d); setSlotTime(t); setSlotPractitionerId(undefined)
    setNewBookingOpen(true)
  }

  /** Calendar DnD drop */
  function handleCalEventDrop({ event, start, end }: EventInteractionArgs<CalEvent>) {
    const ev = event as CalEvent
    if (ev.resource.type || !['pending', 'confirmed'].includes(ev.resource.status)) return
    setDragConfirm({
      event:             ev,
      newStart:          new Date(start),
      newEnd:            new Date(end),
      newPractitionerId: ev.resource.practitioner?.id ?? '',
    })
  }

  // ── Gantt helpers ─────────────────────────────────────────────────
  const weekStart = startOfWk(date, { weekStartsOn: 1 })
  const weekEnd   = endOfWeek(date, { weekStartsOn: 1 })
  const weekDays  = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  function ganttNavigate(dir: number) {
    if (ganttMode === 'day') setDate(d => addDays(d, dir))
    else setDate(d => dir > 0 ? addWeeks(d, 1) : subWeeks(d, 1))
  }

  function timeToOffset(d: Date) {
    const h = d.getHours() + d.getMinutes() / 60
    return (h - 8) * HOUR_WIDTH
  }

  function durationToWidth(s: Date, e: Date) {
    return ((e.getTime() - s.getTime()) / 60000 / 60) * HOUR_WIDTH
  }

  function bookingsForPractitioner(practitionerId: string, day?: Date) {
    return events.filter(ev => {
      if (ev.resource.practitioner?.id !== practitionerId) return false
      if (day) return isSameDay(ev.start, day)
      return isSameDay(ev.start, date)
    })
  }

  function openGanttSlot(practitionerId: string, day: Date) {
    setSlotDate(format(day, 'yyyy-MM-dd'))
    setSlotTime(nearestSlot())
    setSlotPractitionerId(practitionerId)
    setNewBookingOpen(true)
  }

  // ── Gantt DnD — Day view ──────────────────────────────────────────
  function handleGanttDragStart(e: React.DragEvent, ev: CalEvent) {
    e.dataTransfer.effectAllowed = 'move'
    setDraggingEvent(ev)
  }

  function handleGanttDayDragOver(e: React.DragEvent, practitionerId: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverRow(practitionerId)
  }

  function handleGanttDayDrop(e: React.DragEvent, practitionerId: string) {
    e.preventDefault()
    e.stopPropagation()
    setDragOverRow(null)
    if (!draggingEvent) return

    const td   = e.currentTarget as HTMLElement
    const rect = td.getBoundingClientRect()
    const relX = e.clientX - rect.left

    // Convert X to time: relX pixels → minutes offset from 08:00
    const minutesFrom8 = (relX / HOUR_WIDTH) * 60
    const totalMinutes = 8 * 60 + minutesFrom8
    const snapped = Math.round(totalMinutes / 15) * 15
    const h = Math.floor(snapped / 60)
    const m = snapped % 60

    const clampedH = Math.max(8, Math.min(20, h))
    const newStart = new Date(date)
    newStart.setHours(clampedH, m, 0, 0)

    const duration = draggingEvent.end.getTime() - draggingEvent.start.getTime()
    const newEnd   = new Date(newStart.getTime() + duration)

    setDraggingEvent(null)
    setDragConfirm({ event: draggingEvent, newStart, newEnd, newPractitionerId: practitionerId })
  }

  // ── Gantt DnD — Week view ─────────────────────────────────────────
  function handleGanttWeekDrop(e: React.DragEvent, practitionerId: string, day: Date) {
    e.preventDefault()
    e.stopPropagation()
    setDragOverRow(null)
    if (!draggingEvent) return

    // Keep original time-of-day, change date (and possibly practitioner)
    const newStart = new Date(day)
    newStart.setHours(draggingEvent.start.getHours(), draggingEvent.start.getMinutes(), 0, 0)
    const duration = draggingEvent.end.getTime() - draggingEvent.start.getTime()
    const newEnd   = new Date(newStart.getTime() + duration)

    setDraggingEvent(null)
    setDragConfirm({ event: draggingEvent, newStart, newEnd, newPractitionerId: practitionerId })
  }

  // ── DnD confirm ───────────────────────────────────────────────────
  async function handleDragConfirm() {
    if (!dragConfirm) return
    const { event, newStart, newEnd, newPractitionerId } = dragConfirm
    setDragSaving(true)

    const { data, error } = await supabase.rpc('upsert_booking', {
      p_booking_id:      event.id,
      p_client_id:       event.resource.client?.id,
      p_practitioner_id: newPractitionerId,
      p_service_id:      event.resource.service_id,
      p_start_time:      newStart.toISOString(),
      p_end_time:        newEnd.toISOString(),
      p_buffer_minutes:  event.resource.buffer_minutes,
      p_notes:           event.resource.notes,
      p_store_id:        STORE_ID,
    })

    setDragSaving(false)

    if (error) { toast.error('更新失敗', error.message); setDragConfirm(null); return }

    const result = data as { ok: boolean; error?: string; conflict?: any }
    if (!result.ok) {
      if (result.error === 'PRACTITIONER_BLOCKED') {
        toast.error('從業人員不可預約', '該時段已被設定為封鎖時段（如休假）')
      } else if (result.error === 'TIME_CONFLICT' && result.conflict) {
        const c = result.conflict
        toast.error('時間衝突', `${c.client_name} · ${c.service_name} 已佔用此時段`)
      } else {
        toast.error('更新失敗', result.error ?? '未知錯誤')
      }
      setDragConfirm(null)
      return
    }

    toast.success('預約已更新', `${format(newStart, 'M/d HH:mm')}`)
    setDragConfirm(null)
    if (selectedEvent?.id === event.id) setSelectedEvent(null)
    fetchBookings()
  }

  // ── Status actions ────────────────────────────────────────────────
  async function handleStatusChange(eventId: string, status: string) {
    const { error } = await supabase.from('bookings').update({ status }).eq('id', eventId)
    if (error) { toast.error('更新失敗', error.message); return }

    const toastMap: Record<string, () => void> = {
      confirmed: () => toast.success('已確認預約'),
      completed: () => toast.success('已標記完課'),
      cancelled: () => toast.info('已取消預約'),
      no_show:   () => toast.warning('已標記未到場'),
    }
    toastMap[status]?.()
    setSelectedEvent(null); setCancelTarget(null)
    fetchBookings()
  }

  function openNewBooking() {
    setSlotDate(undefined); setSlotTime(undefined); setSlotPractitionerId(undefined)
    setNewBookingOpen(true)
  }

  const ganttTitleDate = ganttMode === 'day'
    ? format(date, 'yyyy年 M月 d日 (EEEE)', { locale: zhTW })
    : `${format(weekStart, 'M/d', { locale: zhTW })} – ${format(weekEnd, 'M/d', { locale: zhTW })}`

  const totalGanttWidth = HOURS.length * HOUR_WIDTH

  // ── Computed calendar events (bookings + buffer phantoms + block events) ──
  const allCalEvents = useMemo<CalEvent[]>(() => {
    // Buffer phantom events — gray blocks right after each booking
    const bufferEvts: CalEvent[] = events.flatMap(ev => {
      if (ev.resource.buffer_minutes <= 0) return []
      return [{
        id:    `buffer-${ev.id}`,
        title: '緩衝時間',
        start: ev.end,
        end:   new Date(ev.end.getTime() + ev.resource.buffer_minutes * 60000),
        resource: {
          type:           'buffer' as const,
          status:         'buffer',
          practitioner:   ev.resource.practitioner,
          client:         null,
          service_id:     '',
          service:        null,
          notes:          null,
          buffer_minutes: 0,
        },
      }]
    })

    // Practitioner block events — red hatched blocks
    const blockEvts: CalEvent[] = practitionerBlocks.map(b => {
      const prac = practitioners.find(p => p.id === b.practitioner_id) ?? null
      return {
        id:    `block-${b.id}`,
        title: `${prac?.full_name ?? ''}${b.reason ? ` — ${b.reason}` : '（不可預約）'}`,
        start: new Date(b.start_time),
        end:   new Date(b.end_time),
        resource: {
          type:           'block' as const,
          status:         'block',
          practitioner:   prac,
          client:         null,
          service_id:     '',
          service:        null,
          notes:          b.reason,
          buffer_minutes: 0,
        },
      }
    })

    return [...events, ...bufferEvts, ...blockEvts]
  }, [events, practitionerBlocks, practitioners])

  // Calendar min/max based on business hours
  const calMin = useMemo(() => {
    const [h, m] = storeOpenTime.split(':').map(Number)
    const d = new Date(); d.setHours(h, m, 0, 0); return d
  }, [storeOpenTime])

  const calMax = useMemo(() => {
    const [h, m] = storeCloseTime.split(':').map(Number)
    const d = new Date(); d.setHours(h, m, 0, 0); return d
  }, [storeCloseTime])

  return (
    <div className="flex h-screen bg-slate-50">
      {/* ── Main area ── */}
      <div className={cn('flex-1 flex flex-col min-w-0 transition-all', selectedEvent && 'pr-3')}>

        {/* Header */}
        <div className="bg-white px-6 py-6 shadow-md border-b border-slate-200">
          <div className="flex items-center justify-between">
            {/* Left: title + all view controls */}
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-4xl font-bold text-text-primary flex items-center gap-2.5">
                <CalendarRange size={24} strokeWidth={1.5} className="text-indigo-500" />
                預約管理
              </h1>

              {/* Page mode toggle */}
              <div className="flex items-center bg-white border border-slate-200 rounded-2xl p-1 shadow-sm gap-1">
                {(['calendar', 'gantt'] as PageMode[]).map(m => (
                  <button key={m}
                    onClick={() => { setPageMode(m); setSelectedEvent(null) }}
                    className={cn('px-4 py-1.5 text-sm font-medium rounded-xl transition-all',
                      pageMode === m ? 'bg-black text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50')}>
                    {m === 'calendar' ? '行事曆' : '甘特圖'}
                  </button>
                ))}
              </div>

              {/* Calendar: month/week/day + date nav */}
              {pageMode === 'calendar' && (
                <>
                  <div className="flex items-center bg-white border border-slate-200 rounded-2xl p-1 shadow-sm gap-1">
                    {(['month', 'week', 'day'] as CalViewMode[]).map(v => (
                      <button key={v} onClick={() => setCalView(v)}
                        className={cn('px-3 py-1.5 text-sm font-medium rounded-xl transition-all',
                          calView === v ? 'bg-black text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50')}>
                        {v === 'month' ? '月' : v === 'week' ? '週' : '日'}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => calNavigate(-1)}
                      className="w-8 h-8 flex items-center justify-center rounded-2xl bg-white border border-slate-200 shadow-sm hover:bg-slate-50 text-slate-500 transition-colors">
                      <ChevronLeft size={16} strokeWidth={2} />
                    </button>
                    <span className="text-sm font-medium text-slate-700 min-w-[160px] text-center select-none">
                      {calTitle}
                    </span>
                    <button onClick={() => calNavigate(1)}
                      className="w-8 h-8 flex items-center justify-center rounded-2xl bg-white border border-slate-200 shadow-sm hover:bg-slate-50 text-slate-500 transition-colors">
                      <ChevronRight size={16} strokeWidth={2} />
                    </button>
                  </div>
                  <button onClick={() => setDate(new Date())}
                    className="text-sm px-3 py-1.5 rounded-2xl bg-white border border-slate-200 shadow-sm text-slate-600 hover:bg-slate-50 transition-colors font-medium">
                    今天
                  </button>
                </>
              )}

              {/* Gantt: day/week + date nav */}
              {pageMode === 'gantt' && (
                <>
                  <div className="flex items-center bg-white border border-slate-200 rounded-2xl p-1 shadow-sm gap-1">
                    {(['week', 'day'] as GanttMode[]).map(m => (
                      <button key={m} onClick={() => setGanttMode(m)}
                        className={cn('px-3 py-1.5 text-sm font-medium rounded-xl transition-all',
                          ganttMode === m ? 'bg-black text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50')}>
                        {m === 'day' ? '當天' : '當週'}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => ganttNavigate(-1)}
                      className="w-8 h-8 flex items-center justify-center rounded-2xl bg-white border border-slate-200 shadow-sm hover:bg-slate-50 text-slate-500 transition-colors">
                      <ChevronLeft size={16} strokeWidth={2} />
                    </button>
                    <span className="text-sm font-medium text-slate-700 min-w-[180px] text-center select-none">
                      {ganttTitleDate}
                    </span>
                    <button onClick={() => ganttNavigate(1)}
                      className="w-8 h-8 flex items-center justify-center rounded-2xl bg-white border border-slate-200 shadow-sm hover:bg-slate-50 text-slate-500 transition-colors">
                      <ChevronRight size={16} strokeWidth={2} />
                    </button>
                  </div>
                  <button onClick={() => setDate(new Date())}
                    className="text-sm px-3 py-1.5 rounded-2xl bg-white border border-slate-200 shadow-sm text-slate-600 hover:bg-slate-50 transition-colors font-medium">
                    今天
                  </button>
                </>
              )}
            </div>

            {/* Right: new booking */}
            <Button onClick={openNewBooking}>
              <Plus size={16} strokeWidth={2} /> 新增預約
            </Button>
          </div>
        </div>

        {/* ── Content wrapper（loading bar 置於此層）── */}
        <div className="relative flex-1 flex flex-col min-h-0 p-6">

          {/* Thin loading bar */}
          <div
            className={cn(
              'absolute -top-2 left-0 right-0 h-[3px] rounded-full overflow-hidden pointer-events-none z-20 transition-opacity duration-300',
              loading ? 'opacity-100' : 'opacity-0',
            )}
          >
            <div className="h-full w-full bg-indigo-400 animate-pulse" />
          </div>

        {/* ── Calendar mode ── */}
        {pageMode === 'calendar' && (
          <div className="flex-1 bg-white rounded-3xl border-0 shadow-lg overflow-hidden">
            <DnDCalendar
              localizer={localizer}
              events={allCalEvents}
              view={calView}
              date={date}
              onView={v => setCalView(v as CalViewMode)}
              onNavigate={setDate}
              onSelectEvent={e => {
                const ev = e as CalEvent
                if (ev.resource.type === 'buffer') {
                  // 點擊緩衝區塊 → 開啟母預約詳情
                  const parentId = ev.id.replace('buffer-', '')
                  const parent = events.find(p => p.id === parentId)
                  if (parent) setSelectedEvent(parent)
                  return
                }
                if (ev.resource.type === 'block') return
                setSelectedEvent(ev)
              }}
              eventPropGetter={eventStyleGetter}
              selectable
              onSelectSlot={handleSelectSlot}
              onEventDrop={handleCalEventDrop}
              draggableAccessor={draggableAccessor}
              resizable={false}
              culture="zh-TW"
              toolbar={false}
              messages={{ noEventsInRange: '這段期間沒有預約' }}
              min={calMin}
              max={calMax}
              style={{ height: '100%' }}
            />
          </div>
        )}

        {/* ── Gantt Day view ── */}
        {pageMode === 'gantt' && ganttMode === 'day' && (
          <div className="bg-white rounded-3xl border-0 shadow-lg overflow-hidden flex-1">
            <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-200px)]">
              <table className="border-collapse" style={{ minWidth: totalGanttWidth + 160 }}>
                <thead className="sticky top-0 z-10 bg-white">
                  <tr>
                    <th className="w-36 min-w-36 border-b border-r border-slate-200 bg-slate-50 text-left px-4 py-2.5 text-xs font-medium text-slate-500 sticky left-0 z-20">
                      從業人員
                    </th>
                    {HOURS.map(h => (
                      <th key={h}
                        className="border-b border-r border-slate-100 text-xs font-normal text-slate-400 text-left px-1 py-2.5 bg-white"
                        style={{ width: HOUR_WIDTH, minWidth: HOUR_WIDTH }}>
                        {h.toString().padStart(2, '0')}:00
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {practitioners.length === 0 ? (
                    <tr>
                      <td colSpan={HOURS.length + 1} className="py-16 text-center text-slate-400 text-sm">
                        尚無從業人員資料
                      </td>
                    </tr>
                  ) : practitioners.map(p => {
                    const pBookings = bookingsForPractitioner(p.id)
                    const isOver    = dragOverRow === p.id
                    return (
                      <tr key={p.id} className={cn(
                        'border-b border-slate-100 transition-colors',
                        isOver ? 'bg-indigo-50/60' : 'hover:bg-slate-50/50 group',
                      )}>
                        <td className="px-4 py-3 sticky left-0 bg-white border-r border-slate-200 z-10">
                          <PractitionerCell p={p} />
                        </td>
                        {/* Time row */}
                        <td
                          colSpan={HOURS.length}
                          className="relative p-0 cursor-pointer"
                          style={{ height: 56 }}
                          onClick={() => {
                            if (draggingEvent) return // prevent open while dragging
                            openGanttSlot(p.id, date)
                          }}
                          onDragOver={e => handleGanttDayDragOver(e, p.id)}
                          onDragLeave={() => setDragOverRow(null)}
                          onDrop={e => handleGanttDayDrop(e, p.id)}
                        >
                          {/* Hour grid lines */}
                          {HOURS.map((_, i) => (
                            <div key={i} className="absolute top-0 bottom-0 border-r border-slate-100"
                              style={{ left: i * HOUR_WIDTH, width: HOUR_WIDTH }} />
                          ))}

                          {/* Non-business-hours overlay (before open / after close) */}
                          {(() => {
                            const [oh, om] = storeOpenTime.split(':').map(Number)
                            const [ch, cm] = storeCloseTime.split(':').map(Number)
                            const openOff  = (oh + om / 60 - 8) * HOUR_WIDTH
                            const closeOff = (ch + cm / 60 - 8) * HOUR_WIDTH
                            return (
                              <>
                                {openOff > 0 && (
                                  <div className="absolute top-0 bottom-0 pointer-events-none bg-slate-100/60"
                                    style={{ left: 0, width: Math.min(openOff, totalGanttWidth) }} />
                                )}
                                {closeOff < totalGanttWidth && (
                                  <div className="absolute top-0 bottom-0 pointer-events-none bg-slate-100/60"
                                    style={{ left: Math.max(0, closeOff), width: totalGanttWidth - Math.max(0, closeOff) }} />
                                )}
                              </>
                            )
                          })()}

                          {/* Practitioner block overlays */}
                          {practitionerBlocks
                            .filter(b => {
                              if (b.practitioner_id !== p.id) return false
                              const bStart = new Date(b.start_time)
                              const bEnd   = new Date(b.end_time)
                              const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0)
                              const dayEnd   = new Date(date); dayEnd.setHours(23, 59, 59, 999)
                              return bStart < dayEnd && bEnd > dayStart
                            })
                            .map(b => {
                              const ganttStart = new Date(date); ganttStart.setHours(8, 0, 0, 0)
                              const ganttEnd   = new Date(date); ganttEnd.setHours(21, 0, 0, 0)
                              const bStart = new Date(Math.max(new Date(b.start_time).getTime(), ganttStart.getTime()))
                              const bEnd   = new Date(Math.min(new Date(b.end_time).getTime(), ganttEnd.getTime()))
                              const bLeft  = timeToOffset(bStart)
                              const bWidth = durationToWidth(bStart, bEnd)
                              if (bWidth <= 0) return null
                              return (
                                <div key={`blk-${b.id}`}
                                  className="absolute top-1 bottom-1 rounded-lg pointer-events-none"
                                  style={{
                                    left: Math.max(0, bLeft),
                                    width: bWidth,
                                    backgroundColor: 'rgba(239,68,68,0.12)',
                                    backgroundImage: 'repeating-linear-gradient(45deg,transparent,transparent 5px,rgba(239,68,68,0.08) 5px,rgba(239,68,68,0.08) 10px)',
                                    border: '1px solid rgba(239,68,68,0.25)',
                                    zIndex: 1,
                                  }}
                                >
                                  {bWidth > 80 && (
                                    <span className="absolute inset-x-2 top-1/2 -translate-y-1/2 text-[10px] text-red-400 truncate">
                                      {b.reason ?? '封鎖'}
                                    </span>
                                  )}
                                </div>
                              )
                            })}

                          {/* Booking blocks + buffer blocks */}
                          {pBookings.map(ev => {
                            const left  = timeToOffset(ev.start)
                            const width = durationToWidth(ev.start, ev.end)
                            const isCompleted = ev.resource.status === 'completed'
                            const isTerminal  = ['completed', 'cancelled', 'no_show'].includes(ev.resource.status)
                            const color = isCompleted ? '#94a3b8'
                              : ev.resource.status === 'cancelled' || ev.resource.status === 'no_show' ? '#cbd5e1'
                              : (ev.resource.practitioner?.color ?? '#6366f1')
                            const bufW  = (ev.resource.buffer_minutes / 60) * HOUR_WIDTH
                            const isDraggable = ['pending', 'confirmed'].includes(ev.resource.status)
                            if (left < 0 || left > totalGanttWidth) return null
                            return (
                              <div key={ev.id}>
                                {/* Main booking block */}
                                <div
                                  className={cn(
                                    'absolute top-2 bottom-2 rounded-lg flex items-center gap-1 px-2 text-white overflow-hidden transition-all',
                                    isDraggable ? 'cursor-grab active:cursor-grabbing hover:brightness-110' : 'cursor-pointer',
                                    draggingEvent?.id === ev.id && 'opacity-40',
                                    isCompleted && 'opacity-60',
                                    !isCompleted && isTerminal && 'opacity-45',
                                  )}
                                  style={{ left, width: Math.max(width - 4, 20), backgroundColor: color }}
                                  draggable={isDraggable}
                                  onDragStart={e => { e.stopPropagation(); handleGanttDragStart(e, ev) }}
                                  onDragEnd={() => { setDraggingEvent(null); setDragOverRow(null) }}
                                  onClick={e => { e.stopPropagation(); setSelectedEvent(ev) }}
                                >
                                  {isDraggable && <GripVertical size={11} strokeWidth={2} className="opacity-60 shrink-0" />}
                                  <span className="text-xs font-medium truncate">
                                    {ev.resource.client?.full_name ?? '—'} · {ev.resource.service?.name ?? '—'}
                                  </span>
                                </div>
                                {/* Buffer block — 點擊開母預約詳情 */}
                                {bufW > 0 && (
                                  <div
                                    className="absolute top-2 bottom-2 rounded-md opacity-50 cursor-pointer hover:opacity-70 transition-opacity"
                                    title={`緩衝時間 ${ev.resource.buffer_minutes} 分鐘（點擊查看預約詳情）`}
                                    style={{
                                      left: left + Math.max(width - 4, 20) + 4,
                                      width: Math.min(bufW, totalGanttWidth - left - Math.max(width - 4, 20) - 4),
                                      backgroundColor: '#cbd5e1',
                                      backgroundImage: 'repeating-linear-gradient(45deg,transparent,transparent 5px,rgba(255,255,255,0.5) 5px,rgba(255,255,255,0.5) 10px)',
                                    }}
                                    onClick={e => { e.stopPropagation(); setSelectedEvent(ev) }}
                                  />
                                )}
                              </div>
                            )
                          })}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Gantt Week view ── */}
        {pageMode === 'gantt' && ganttMode === 'week' && (
          <div className="bg-white rounded-3xl border-0 shadow-lg overflow-hidden flex-1">
            <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-200px)]">
              <table className="border-collapse w-full">
                <thead className="sticky top-0 z-10 bg-white">
                  <tr>
                    <th className="w-36 min-w-36 border-b border-r border-slate-200 bg-slate-50 sticky left-0 z-20 text-xs font-medium text-slate-500 text-left px-4 py-2.5">
                      從業人員
                    </th>
                    {weekDays.map(day => (
                      <th key={day.toISOString()}
                        className="border-b border-r border-slate-100 text-xs font-medium text-slate-500 text-center py-2.5 px-2 min-w-[120px]">
                        <div className={cn(isSameDay(day, new Date()) && 'text-indigo-600 font-semibold')}>
                          {format(day, 'E', { locale: zhTW })}
                        </div>
                        <div className={cn(
                          'text-base font-bold mt-0.5 w-7 h-7 rounded-full flex items-center justify-center mx-auto',
                          isSameDay(day, new Date()) ? 'bg-indigo-600 text-white' : 'text-slate-800',
                        )}>
                          {format(day, 'd')}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {practitioners.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-16 text-center text-slate-400 text-sm">
                        尚無從業人員資料
                      </td>
                    </tr>
                  ) : practitioners.map(p => (
                    <tr key={p.id} className="border-b border-slate-100">
                      <td className="px-4 py-3 sticky left-0 bg-white border-r border-slate-200 z-10">
                        <PractitionerCell p={p} />
                      </td>
                      {weekDays.map(day => {
                        const dayBookings = bookingsForPractitioner(p.id, day)
                        const isOver = dragOverRow === `${p.id}-${day.toDateString()}`
                        return (
                          <td
                            key={day.toISOString()}
                            className={cn(
                              'border-r border-slate-100 px-2 py-2 align-top cursor-pointer transition-colors',
                              isSameDay(day, new Date()) && !isOver && 'bg-indigo-50/30',
                              isOver && 'bg-indigo-100/60',
                              !isOver && 'hover:bg-slate-50/50',
                            )}
                            onClick={() => {
                              if (draggingEvent) return
                              openGanttSlot(p.id, day)
                            }}
                            onDragOver={e => {
                              e.preventDefault()
                              e.dataTransfer.dropEffect = 'move'
                              setDragOverRow(`${p.id}-${day.toDateString()}`)
                            }}
                            onDragLeave={() => setDragOverRow(null)}
                            onDrop={e => handleGanttWeekDrop(e, p.id, day)}
                          >
                            <div className="space-y-1">
                              {/* Practitioner block chips */}
                              {practitionerBlocks
                                .filter(b => {
                                  if (b.practitioner_id !== p.id) return false
                                  const bStart   = new Date(b.start_time)
                                  const bEnd     = new Date(b.end_time)
                                  const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0)
                                  const dayEnd   = new Date(day); dayEnd.setHours(23, 59, 59, 999)
                                  return bStart <= dayEnd && bEnd >= dayStart
                                })
                                .map(b => (
                                  <div key={`blk-${b.id}`}
                                    className="bg-red-50 border border-red-200 text-red-500 rounded-lg px-2 py-1 text-xs"
                                  >
                                    <div className="font-medium truncate">🚫 {b.reason ?? '不可預約'}</div>
                                    <div className="opacity-70 text-[10px]">
                                      {format(new Date(b.start_time), 'HH:mm')} – {format(new Date(b.end_time), 'HH:mm')}
                                    </div>
                                  </div>
                                ))
                              }
                              {dayBookings.map(ev => {
                                const isDraggable = ['pending', 'confirmed'].includes(ev.resource.status)
                                const isCompleted2 = ev.resource.status === 'completed'
                                const isTerminal2  = ['completed', 'cancelled', 'no_show'].includes(ev.resource.status)
                                const weekColor = isCompleted2 ? '#94a3b8'
                                  : ev.resource.status === 'cancelled' || ev.resource.status === 'no_show' ? '#cbd5e1'
                                  : (ev.resource.practitioner?.color ?? '#6366f1')
                                return (
                                  <div
                                    key={ev.id}
                                    className={cn(
                                      'text-white rounded-lg px-2 py-1 text-xs transition-all',
                                      isDraggable ? 'cursor-grab active:cursor-grabbing hover:brightness-110' : 'cursor-pointer hover:brightness-110',
                                      draggingEvent?.id === ev.id && 'opacity-40',
                                      isCompleted2 && 'opacity-60',
                                      !isCompleted2 && isTerminal2 && 'opacity-45',
                                    )}
                                    style={{ backgroundColor: weekColor }}
                                    draggable={isDraggable}
                                    onDragStart={e => { e.stopPropagation(); handleGanttDragStart(e, ev) }}
                                    onDragEnd={() => { setDraggingEvent(null); setDragOverRow(null) }}
                                    onClick={e => { e.stopPropagation(); setSelectedEvent(ev) }}
                                  >
                                    <div className="font-medium truncate flex items-center gap-1">
                                      {isDraggable && <GripVertical size={10} strokeWidth={2} className="opacity-60 shrink-0" />}
                                      {ev.resource.client?.full_name ?? '—'}
                                    </div>
                                    <div className="opacity-80 truncate">{format(ev.start, 'HH:mm')} {ev.resource.service?.name}</div>
                                    {ev.resource.buffer_minutes > 0 && (
                                      <div className="opacity-60 text-[10px] flex items-center gap-0.5 mt-0.5">
                                        <div className="w-2 h-2 rounded-sm bg-white/40" />
                                        緩衝 {ev.resource.buffer_minutes}分
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                              {dayBookings.length === 0 && <div className="h-8" />}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Gantt legend */}
        {pageMode === 'gantt' && (
          <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
            {Object.entries(STATUS_LABEL).map(([key, label]) => (
              <div key={key} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: GANTT_COLOR[key] }} />
                {label}
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-slate-200" style={{
                backgroundImage: 'repeating-linear-gradient(45deg,transparent,transparent 2px,rgba(255,255,255,0.6) 2px,rgba(255,255,255,0.6) 4px)',
              }} />
              緩衝時間
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{
                backgroundColor: 'rgba(239,68,68,0.15)',
                border: '1px solid rgba(239,68,68,0.3)',
              }} />
              封鎖時段
            </div>
          </div>
        )}

        </div>{/* end content wrapper */}
      </div>

      {/* ── Detail sidebar ── */}
      {selectedEvent && (
        <div className="w-80 border-l border-slate-200 bg-white flex flex-col shadow-lg">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">預約詳情</h2>
            <button onClick={() => setSelectedEvent(null)}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
              <X size={16} strokeWidth={2} />
            </button>
          </div>

          <div className="flex-1 overflow-auto p-5 space-y-5">
            <span className={cn('inline-flex px-2.5 py-1 rounded-full text-xs font-medium', STATUS_COLOR[selectedEvent.resource.status])}>
              {STATUS_LABEL[selectedEvent.resource.status]}
            </span>

            <div className="space-y-4">
              <InfoRow label="客戶">
                <p className="font-semibold text-slate-900 text-sm">{selectedEvent.resource.client?.full_name}</p>
                {selectedEvent.resource.client?.phone && (
                  <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                    <Phone size={11} strokeWidth={1.5} /> {selectedEvent.resource.client.phone}
                  </p>
                )}
              </InfoRow>
              <InfoRow label="課程">
                <p className="text-sm font-medium text-slate-900">{selectedEvent.resource.service?.name}</p>
                <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                  <Clock size={11} strokeWidth={1.5} /> {selectedEvent.resource.service?.duration_minutes} 分鐘
                  {selectedEvent.resource.buffer_minutes > 0 && (
                    <span className="text-slate-400">＋{selectedEvent.resource.buffer_minutes} 分緩衝</span>
                  )}
                </p>
              </InfoRow>
              <InfoRow label="金額">
                <p className="text-sm font-semibold text-emerald-600">
                  NT$ {selectedEvent.resource.price.toLocaleString()}
                  {selectedEvent.resource.service && selectedEvent.resource.price !== selectedEvent.resource.service.price && (
                    <span className="ml-1.5 text-xs font-normal text-slate-400 line-through">
                      NT$ {selectedEvent.resource.service.price.toLocaleString()}
                    </span>
                  )}
                </p>
              </InfoRow>
              <InfoRow label="時間">
                <p className="text-sm text-slate-900">{format(selectedEvent.start, 'MM/dd (EEE) HH:mm', { locale: zhTW })}</p>
                <p className="text-xs text-slate-500">~ {format(selectedEvent.end, 'HH:mm')}
                  {selectedEvent.resource.buffer_minutes > 0 && (
                    <span className="text-slate-400 ml-1">
                      （含緩衝至 {format(new Date(selectedEvent.end.getTime() + selectedEvent.resource.buffer_minutes * 60000), 'HH:mm')}）
                    </span>
                  )}
                </p>
              </InfoRow>
              <InfoRow label="從業人員">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-xl flex items-center justify-center text-white text-xs font-semibold"
                    style={{ backgroundColor: selectedEvent.resource.practitioner?.color ?? '#6366f1' }}>
                    {selectedEvent.resource.practitioner?.full_name?.[0]}
                  </div>
                  <span className="text-sm text-slate-900">{selectedEvent.resource.practitioner?.full_name}</span>
                </div>
              </InfoRow>
              {selectedEvent.resource.notes && (
                <InfoRow label="備注">
                  <p className="text-sm text-slate-600 bg-slate-50 rounded-2xl p-2.5">{selectedEvent.resource.notes}</p>
                </InfoRow>
              )}
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-1">
              {['pending', 'confirmed'].includes(selectedEvent.resource.status) && (
                <button
                  onClick={() => setEditTarget(selectedEvent)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  <Pencil size={15} strokeWidth={1.5} /> 編輯預約
                </button>
              )}
              {selectedEvent.resource.status === 'pending' && (
                <button onClick={() => handleStatusChange(selectedEvent.id, 'confirmed')}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100 transition-colors">
                  <CheckCircle size={16} strokeWidth={1.5} /> 確認預約
                </button>
              )}
              {selectedEvent.resource.status === 'confirmed' && (
                <button onClick={() => handleStatusChange(selectedEvent.id, 'completed')}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-emerald-50 text-emerald-700 text-sm font-medium hover:bg-emerald-100 transition-colors">
                  <CheckCircle size={16} strokeWidth={1.5} /> 標記完課
                </button>
              )}
              {selectedEvent.resource.status === 'confirmed' && (
                <button onClick={() => handleStatusChange(selectedEvent.id, 'no_show')}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-slate-50 text-slate-600 text-sm font-medium hover:bg-slate-100 transition-colors">
                  <AlertCircle size={16} strokeWidth={1.5} /> 未到場
                </button>
              )}
              {['pending', 'confirmed'].includes(selectedEvent.resource.status) && (
                <button onClick={() => setCancelTarget(selectedEvent)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-red-50 text-red-600 text-sm font-medium hover:bg-red-100 transition-colors">
                  <XCircle size={16} strokeWidth={1.5} /> 取消預約
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Cancel confirmation ── */}
      <Modal open={!!cancelTarget} onClose={() => setCancelTarget(null)} title="取消預約" size="sm">
        <p className="text-sm text-slate-600 mb-2">確定要取消以下預約嗎？</p>
        {cancelTarget && (
          <div className="bg-slate-50 rounded-2xl p-3 mb-5 space-y-0.5">
            <p className="text-sm font-semibold text-slate-900">{cancelTarget.resource.client?.full_name}</p>
            <p className="text-xs text-slate-500">
              {cancelTarget.resource.service?.name} · {format(cancelTarget.start, 'MM/dd HH:mm', { locale: zhTW })} – {format(cancelTarget.end, 'HH:mm')}
            </p>
            <p className="text-xs text-slate-400">{cancelTarget.resource.practitioner?.full_name}</p>
          </div>
        )}
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setCancelTarget(null)}>返回</Button>
          <Button variant="danger" className="flex-1"
            onClick={() => cancelTarget && handleStatusChange(cancelTarget.id, 'cancelled')}>
            確認取消
          </Button>
        </div>
      </Modal>

      {/* ── Drag & Drop 確認 ── */}
      <Modal open={!!dragConfirm} onClose={() => setDragConfirm(null)} title="確認移動預約" size="sm">
        {dragConfirm && (
          <>
            <div className="space-y-3 mb-5">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center">
                    <span className="text-xs text-slate-400">前</span>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {dragConfirm.event.resource.client?.full_name} · {dragConfirm.event.resource.service?.name}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {format(dragConfirm.event.start, 'M/d (EEE) HH:mm', { locale: zhTW })} –{' '}
                    {format(dragConfirm.event.end, 'HH:mm')}
                  </p>
                  <p className="text-xs text-slate-400">{dragConfirm.event.resource.practitioner?.full_name}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 text-slate-300 pl-3">
                <div className="flex-1 h-px bg-slate-100" />
                <span className="text-xs">移動至</span>
                <div className="flex-1 h-px bg-slate-100" />
              </div>

              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center">
                    <span className="text-xs text-indigo-600">後</span>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {format(dragConfirm.newStart, 'M/d (EEE) HH:mm', { locale: zhTW })} –{' '}
                    {format(dragConfirm.newEnd, 'HH:mm')}
                  </p>
                  {dragConfirm.newPractitionerId !== dragConfirm.event.resource.practitioner?.id && (
                    <p className="text-xs text-indigo-600 mt-0.5">
                      從業人員：{practitioners.find(p => p.id === dragConfirm.newPractitionerId)?.full_name ?? '—'}
                    </p>
                  )}
                  {dragConfirm.event.resource.buffer_minutes > 0 && (
                    <p className="text-xs text-slate-400 mt-0.5">
                      含 {dragConfirm.event.resource.buffer_minutes} 分鐘緩衝
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setDragConfirm(null)}>取消</Button>
              <Button className="flex-1" loading={dragSaving} onClick={handleDragConfirm}>確認移動</Button>
            </div>
          </>
        )}
      </Modal>

      {/* ── New Booking ── */}
      <NewBookingModal
        open={newBookingOpen}
        onClose={() => setNewBookingOpen(false)}
        onSaved={() => { setNewBookingOpen(false); fetchBookings() }}
        practitioners={practitioners}
        clients={clients}
        services={services}
        onRefreshClients={fetchMeta}
        initialDate={slotDate}
        initialTime={slotTime}
        initialPractitionerId={slotPractitionerId}
        defaultBufferMinutes={defaultBufferMinutes}
      />

      {/* ── Edit Booking ── */}
      {editTarget && (
        <NewBookingModal
          mode="edit"
          initialBooking={{
            id:               editTarget.id,
            client_id:        editTarget.resource.client?.id ?? '',
            practitioner_id:  editTarget.resource.practitioner?.id ?? '',
            service_id:       editTarget.resource.service_id,
            start_time:       editTarget.start.toISOString(),
            notes:            editTarget.resource.notes,
            buffer_minutes:   editTarget.resource.buffer_minutes,
            price:            editTarget.resource.price,
          }}
          open={!!editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); setSelectedEvent(null); fetchBookings() }}
          practitioners={practitioners}
          clients={clients}
          services={services}
          onRefreshClients={fetchMeta}
          defaultBufferMinutes={defaultBufferMinutes}
        />
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PractitionerCell({ p }: { p: Practitioner }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
        style={{ backgroundColor: p.color ?? '#6366f1' }}
      >
        {p.full_name[0]}
      </div>
      <span className="text-sm font-medium text-slate-800 truncate max-w-[80px]">{p.full_name}</span>
    </div>
  )
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-slate-400 font-medium mb-1">{label}</p>
      {children}
    </div>
  )
}
