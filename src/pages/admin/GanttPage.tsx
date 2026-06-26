import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ChevronLeft, ChevronRight, Phone, Clock } from 'lucide-react'
import { toast } from '@/components/ui/Snackbar'

// ── 型別 ─────────────────────────────────────────────────────────────────────

interface Booking {
  id: string
  start_time: string
  end_time: string
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
  client_id: string
  practitioner_id: string
  service_id: string
  notes: string | null
  price: number | null
  buffer_minutes: number
  client?: { full_name: string; phone?: string }
  practitioner?: { id: string; full_name: string; color: string | null }
  service?: { name: string; duration_minutes: number }
}

interface Practitioner {
  id: string
  full_name: string
  color: string | null
}

interface DragState {
  booking: Booking
  practitionerIndex: number
  offsetX: number   // cursor offset from card left
  ghostX: number
  ghostY: number
  targetPractitionerIndex: number
  targetStartHour: number // float, e.g. 10.25 = 10:15
}

interface TooltipState {
  booking: Booking
  x: number
  y: number
}

// ── 常數 ─────────────────────────────────────────────────────────────────────

const STORE_ID       = '00000000-0000-0000-0000-000000000001'
const CELL_WIDTH     = 80   // px per hour
const ROW_HEIGHT     = 64   // px per practitioner row
const LABEL_WIDTH    = 168  // px for name column
const HEADER_HEIGHT  = 40   // px for time header

const STATUS_LABEL: Record<string, string> = {
  confirmed: '已確認',
  pending:   '待確認',
  completed: '已完課',
  cancelled: '已取消',
  no_show:   '未到場',
}

function cardStyle(booking: Booking): React.CSSProperties {
  const color = booking.practitioner?.color ?? '#6366f1'
  if (booking.status === 'completed') return { backgroundColor: '#94a3b8' }
  if (booking.status === 'no_show')   return { backgroundColor: color, opacity: 0.4 }
  if (booking.status === 'pending')   return { backgroundColor: color, opacity: 0.7 }
  return { backgroundColor: color }
}

function clientLabel(booking: Booking) {
  return booking.status === 'pending' ? '待確認' : (booking.client?.full_name ?? '')
}

// ── Props ────────────────────────────────────────────────────────────────────

interface GanttPageProps {
  selectedPractitionerId?: string | null
  defaultDate?: Date
  startHour?: number
  endHour?: number
}

// ── 主元件 ───────────────────────────────────────────────────────────────────

export default function GanttPage({
  selectedPractitionerId,
  defaultDate,
  startHour = 9,
  endHour = 21,
}: GanttPageProps) {
  const totalHours = endHour - startHour

  const [bookings,      setBookings]      = useState<Booking[]>([])
  const [practitioners, setPractitioners] = useState<Practitioner[]>([])
  const [isLoading,     setIsLoading]     = useState(true)
  const [selectedDate,  setSelectedDate]  = useState(defaultDate || new Date())
  const [dragState,     setDragState]     = useState<DragState | null>(null)
  const [tooltip,       setTooltip]       = useState<TooltipState | null>(null)

  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadData() }, [selectedDate, selectedPractitionerId])

  // ── 拖曳：document-level mouse events ──────────────────────────────────────

  useEffect(() => {
    if (!dragState) return

    const onMove = (e: MouseEvent) => {
      const grid = gridRef.current
      if (!grid) return
      const rect = grid.getBoundingClientRect()

      // 相對於時間格子區域的 x（扣掉 label 欄 + 游標 offset）
      const relX = e.clientX - rect.left - LABEL_WIDTH - dragState.offsetX
      // 計算 snap to 15 min
      const rawHour = startHour + relX / CELL_WIDTH
      const snapped = Math.round(Math.max(startHour, Math.min(endHour - 0.25, rawHour)) * 4) / 4

      // 相對於 y（扣掉 header 高度）
      const relY = e.clientY - rect.top - HEADER_HEIGHT
      const targetRow = Math.max(0, Math.min(practitioners.length - 1, Math.floor(relY / ROW_HEIGHT)))

      setDragState(prev => prev ? { ...prev, ghostX: e.clientX, ghostY: e.clientY, targetPractitionerIndex: targetRow, targetStartHour: snapped } : null)
    }

    const onUp = async () => {
      if (!dragState) return
      const { booking, targetPractitionerIndex, targetStartHour } = dragState
      const targetPract = practitioners[targetPractitionerIndex]
      setDragState(null)

      // 計算新時間
      const originalStart = new Date(booking.start_time)
      const originalEnd   = new Date(booking.end_time)
      const duration      = originalEnd.getTime() - originalStart.getTime()

      const hours   = Math.floor(targetStartHour)
      const minutes = Math.round((targetStartHour - hours) * 60)
      const newStart = new Date(selectedDate)
      newStart.setHours(hours, minutes, 0, 0)
      const newEnd = new Date(newStart.getTime() + duration)

      // 如果沒有變動，略過
      if (
        newStart.toISOString() === booking.start_time &&
        targetPract.id === booking.practitioner_id
      ) return

      // Optimistic update
      setBookings(prev => prev.map(b => b.id !== booking.id ? b : {
        ...b,
        practitioner_id: targetPract.id,
        start_time: newStart.toISOString(),
        end_time:   newEnd.toISOString(),
        practitioner: { id: targetPract.id, full_name: targetPract.full_name, color: targetPract.color },
      }))

      // Supabase
      const { data, error } = await supabase.rpc('upsert_booking', {
        p_booking_id:      booking.id,
        p_client_id:       booking.client_id,
        p_practitioner_id: targetPract.id,
        p_service_id:      booking.service_id,
        p_start_time:      newStart.toISOString(),
        p_end_time:        newEnd.toISOString(),
        p_buffer_minutes:  booking.buffer_minutes ?? 0,
        p_notes:           booking.notes,
        p_store_id:        STORE_ID,
        p_price:           booking.price ?? 0,
      })

      if (error) {
        toast.error('移動失敗', error.message)
        await loadData()
        return
      }
      const result = data as { ok: boolean; error?: string; conflict?: { client_name: string; service_name: string } }
      if (!result.ok) {
        if (result.error === 'TIME_CONFLICT' && result.conflict) {
          toast.error('時間衝突', `${result.conflict.client_name} · ${result.conflict.service_name} 已佔用此時段`)
        } else {
          toast.error('移動失敗', result.error ?? '未知錯誤')
        }
        await loadData()
        return
      }
      toast.success('預約已更新')
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
    }
  }, [dragState, practitioners, selectedDate, startHour, endHour])

  // ── 資料載入 ────────────────────────────────────────────────────────────────

  async function loadData() {
    setIsLoading(true)
    try {
      let practQ = supabase.from('practitioners').select('id, full_name, color').eq('active', true).order('full_name')
      if (selectedPractitionerId) practQ = practQ.eq('id', selectedPractitionerId)
      const { data: pData } = await practQ
      setPractitioners(pData || [])

      const startOfDay = new Date(selectedDate); startOfDay.setHours(0, 0, 0, 0)
      const endOfDay   = new Date(selectedDate); endOfDay.setHours(23, 59, 59, 999)

      let bookQ = supabase.from('bookings').select(`
        id, start_time, end_time, status, client_id, practitioner_id, service_id,
        notes, price, buffer_minutes,
        client:clients(full_name, phone),
        practitioner:practitioners(id, full_name, color),
        service:services(name, duration_minutes)
      `)
        .gte('start_time', startOfDay.toISOString())
        .lt('start_time',  endOfDay.toISOString())
        .in('status', ['pending', 'confirmed', 'completed', 'no_show'])
      if (selectedPractitionerId) bookQ = bookQ.eq('practitioner_id', selectedPractitionerId)

      const { data: bData } = await bookQ.order('start_time')
      setBookings((bData || []) as unknown as Booking[])
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }

  // ── 位置計算 ────────────────────────────────────────────────────────────────

  function getPosition(booking: Booking): { left: number; width: number } | null {
    const s = new Date(booking.start_time)
    const e = new Date(booking.end_time)
    const sH = s.getHours() + s.getMinutes() / 60
    const eH = e.getHours() + e.getMinutes() / 60
    if (sH >= endHour || eH <= startHour) return null
    const cs = Math.max(sH, startHour)
    const ce = Math.min(eH, endHour)
    return {
      left:  (cs - startHour) * CELL_WIDTH,
      width: Math.max((ce - cs) * CELL_WIDTH - 3, 24),
    }
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  function formatDate(d: Date) {
    return d.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })
  }

  const handlePrev = () => { const d = new Date(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(d) }
  const handleNext = () => { const d = new Date(selectedDate); d.setDate(d.getDate() + 1); setSelectedDate(d) }

  // ── Drag ghost 寬度（依照原始預約時長）──────────────────────────────────────

  const ghostWidth = dragState ? (() => {
    const s = new Date(dragState.booking.start_time)
    const e = new Date(dragState.booking.end_time)
    const dur = (e.getTime() - s.getTime()) / 3600000
    return Math.max(dur * CELL_WIDTH - 3, 24)
  })() : 0

  // ── Render ───────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 select-none">
      <div className="px-6 py-6">

        {/* 標題列 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">甘特圖視圖</h1>
            <p className="text-sm text-slate-500 mt-1">拖曳卡片可調整時間或更換從業人員</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handlePrev} className="p-2 hover:bg-white rounded-lg transition text-slate-400 hover:text-slate-700 border border-transparent hover:border-slate-200">
              <ChevronLeft size={18} />
            </button>
            <div className="text-center min-w-44">
              <p className="text-base font-semibold text-slate-900">{formatDate(selectedDate)}</p>
              <p className="text-xs text-slate-400 mt-0.5">{bookings.length} 筆預約</p>
            </div>
            <button onClick={handleNext} className="p-2 hover:bg-white rounded-lg transition text-slate-400 hover:text-slate-700 border border-transparent hover:border-slate-200">
              <ChevronRight size={18} />
            </button>
            <button
              onClick={() => setSelectedDate(new Date())}
              className="px-4 py-2 bg-black text-white text-sm rounded-xl hover:bg-slate-800 transition font-medium"
            >
              回到今天
            </button>
          </div>
        </div>

        {/* 甘特圖主體 */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden" ref={gridRef}>
          <div className="overflow-x-auto">
            <div style={{ minWidth: LABEL_WIDTH + totalHours * CELL_WIDTH }}>

              {/* Header：老師欄 + 時間軸 */}
              <div className="flex border-b border-slate-200 bg-slate-50 sticky top-0 z-20" style={{ height: HEADER_HEIGHT }}>
                <div
                  className="flex-shrink-0 flex items-center px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider border-r border-slate-200"
                  style={{ width: LABEL_WIDTH }}
                >
                  從業人員
                </div>
                <div className="flex">
                  {Array.from({ length: totalHours }).map((_, i) => (
                    <div
                      key={i}
                      className="border-r border-slate-200 flex items-center justify-center text-xs font-medium text-slate-400"
                      style={{ width: CELL_WIDTH, height: HEADER_HEIGHT }}
                    >
                      {String(startHour + i).padStart(2, '0')}:00
                    </div>
                  ))}
                </div>
              </div>

              {/* 老師列 */}
              {practitioners.length === 0 ? (
                <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
                  暫無從業人員資料
                </div>
              ) : (
                practitioners.map((p, pIdx) => {
                  const pBookings = bookings.filter(b => b.practitioner_id === p.id)
                  const isTargetRow = dragState?.targetPractitionerIndex === pIdx

                  return (
                    <div
                      key={p.id}
                      className={`flex border-b border-slate-100 last:border-0 transition-colors ${isTargetRow && dragState ? 'bg-indigo-50/40' : ''}`}
                      style={{ height: ROW_HEIGHT }}
                    >
                      {/* 老師名稱 */}
                      <div
                        className="flex-shrink-0 flex items-center px-4 gap-2.5 border-r border-slate-200 bg-white"
                        style={{ width: LABEL_WIDTH }}
                      >
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color ?? '#6366f1' }} />
                        <span className="text-sm font-medium text-slate-700 truncate">{p.full_name}</span>
                      </div>

                      {/* 時間格 + 卡片 */}
                      <div className="relative flex flex-1" style={{ width: totalHours * CELL_WIDTH }}>
                        {/* 格線背景 */}
                        {Array.from({ length: totalHours }).map((_, i) => (
                          <div key={i} className="border-r border-slate-100 h-full flex-shrink-0" style={{ width: CELL_WIDTH }} />
                        ))}

                        {/* 現在時間線 */}
                        {(() => {
                          const now = new Date()
                          if (now.toDateString() !== selectedDate.toDateString()) return null
                          const nowH = now.getHours() + now.getMinutes() / 60
                          if (nowH < startHour || nowH > endHour) return null
                          return (
                            <div className="absolute top-0 bottom-0 w-px bg-red-400 z-10 pointer-events-none"
                              style={{ left: (nowH - startHour) * CELL_WIDTH }} />
                          )
                        })()}

                        {/* 拖曳目標時間指示線 */}
                        {isTargetRow && dragState && (
                          <div className="absolute top-0 bottom-0 z-20 pointer-events-none"
                            style={{ left: (dragState.targetStartHour - startHour) * CELL_WIDTH }}>
                            <div className="w-px h-full bg-indigo-400 opacity-60" />
                            <div className="absolute -top-0.5 -left-5 text-[10px] font-semibold text-indigo-600 bg-white border border-indigo-200 rounded px-1">
                              {String(Math.floor(dragState.targetStartHour)).padStart(2, '0')}:{String(Math.round((dragState.targetStartHour % 1) * 60)).padStart(2, '0')}
                            </div>
                          </div>
                        )}

                        {/* 預約卡片 */}
                        {pBookings.map(b => {
                          const pos = getPosition(b)
                          if (!pos) return null
                          const isDragging = dragState?.booking.id === b.id
                          const durationMin = Math.round((new Date(b.end_time).getTime() - new Date(b.start_time).getTime()) / 60000)

                          return (
                            <div
                              key={b.id}
                              className={`absolute top-2 bottom-2 rounded-lg text-white text-xs font-medium overflow-hidden transition-all
                                ${isDragging ? 'opacity-30 cursor-grabbing' : 'cursor-grab hover:brightness-105 hover:shadow-md'}`}
                              style={{ left: pos.left + 1, width: pos.width, ...cardStyle(b) }}
                              onMouseDown={e => {
                                if (e.button !== 0) return
                                e.preventDefault()
                                setTooltip(null)
                                const rect = e.currentTarget.getBoundingClientRect()
                                setDragState({
                                  booking: b,
                                  practitionerIndex: pIdx,
                                  offsetX: e.clientX - rect.left,
                                  ghostX: e.clientX,
                                  ghostY: e.clientY,
                                  targetPractitionerIndex: pIdx,
                                  targetStartHour: startHour + (rect.left - (gridRef.current?.getBoundingClientRect().left ?? 0) - LABEL_WIDTH) / CELL_WIDTH,
                                })
                              }}
                              onMouseEnter={e => {
                                if (dragState) return
                                const rect = e.currentTarget.getBoundingClientRect()
                                setTooltip({ booking: b, x: rect.right + 8, y: rect.top })
                              }}
                              onMouseLeave={() => { if (!dragState) setTooltip(null) }}
                            >
                              <div className="px-2 py-1 h-full flex flex-col justify-center leading-tight">
                                <div className="font-semibold truncate text-[11px]">{clientLabel(b)}</div>
                                {pos.width > 70 && (
                                  <div className="opacity-85 text-[10px] truncate">
                                    {formatTime(b.start_time)}·{durationMin}分
                                  </div>
                                )}
                                {pos.width > 110 && b.service?.name && (
                                  <div className="opacity-75 text-[10px] truncate">{b.service.name}</div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* 圖例 */}
        <div className="mt-4 flex flex-wrap gap-5 px-1">
          {[
            { label: '已確認', color: '#6366f1' },
            { label: '待確認', color: '#f59e0b' },
            { label: '已完課', color: '#94a3b8' },
            { label: '未到場', color: '#94a3b8' },
          ].map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: color }} />
              <span className="text-xs text-slate-500">{label}</span>
            </div>
          ))}
          <div className="ml-auto flex items-center gap-1.5 text-xs text-slate-400">
            <span className="text-slate-300">↔</span> 拖曳卡片調整時間或換人
          </div>
        </div>
      </div>

      {/* 拖曳中的 Ghost 卡片 */}
      {dragState && (
        <div
          className="fixed z-50 rounded-lg text-white text-xs font-medium pointer-events-none shadow-xl ring-2 ring-white/40"
          style={{
            left:   dragState.ghostX - dragState.offsetX,
            top:    dragState.ghostY - ROW_HEIGHT / 2 + 8,
            width:  ghostWidth,
            height: ROW_HEIGHT - 16,
            ...cardStyle(dragState.booking),
          }}
        >
          <div className="px-2 py-1 h-full flex flex-col justify-center leading-tight">
            <div className="font-semibold truncate text-[11px]">{dragState.booking.client?.full_name}</div>
            <div className="opacity-85 text-[10px]">
              {String(Math.floor(dragState.targetStartHour)).padStart(2, '0')}:
              {String(Math.round((dragState.targetStartHour % 1) * 60)).padStart(2, '0')}
              {' → '}
              {practitioners[dragState.targetPractitionerIndex]?.full_name}
            </div>
          </div>
        </div>
      )}

      {/* Hover Tooltip */}
      {tooltip && !dragState && (
        <div
          className="fixed z-50 bg-white rounded-2xl shadow-xl border border-slate-100 p-4 pointer-events-none"
          style={{
            left: Math.min(tooltip.x, window.innerWidth - 220),
            width: 210,
            ...(tooltip.y + 200 > window.innerHeight
              ? { bottom: window.innerHeight - tooltip.y, top: 'auto' }
              : { top: tooltip.y }),
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2.5 h-2.5 rounded-full" style={cardStyle(tooltip.booking)} />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              {STATUS_LABEL[tooltip.booking.status]}
            </span>
          </div>
          <p className="font-bold text-slate-900 text-sm truncate">{tooltip.booking.client?.full_name}</p>
          {tooltip.booking.client?.phone && (
            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
              <Phone size={10} /> {tooltip.booking.client.phone}
            </p>
          )}
          <div className="mt-2 pt-2 border-t border-slate-100 space-y-1">
            {tooltip.booking.service?.name && (
              <p className="text-xs text-slate-600">{tooltip.booking.service.name}</p>
            )}
            <p className="text-xs text-slate-400 flex items-center gap-1">
              <Clock size={10} />
              {formatTime(tooltip.booking.start_time)} – {formatTime(tooltip.booking.end_time)}
            </p>
            {tooltip.booking.price != null && (
              <p className="text-xs font-semibold text-emerald-600">NT$ {tooltip.booking.price.toLocaleString()}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
