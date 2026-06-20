import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Booking {
  id: string
  start_time: string
  end_time: string
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
  client_id: string
  practitioner_id: string
  service_id: string
  price?: number | null
  client?: { full_name: string }
  practitioner?: { id: string; full_name: string; color: string | null }
  service?: { name: string }
}

interface Practitioner {
  id: string
  full_name: string
  color: string | null
}

// 與行事曆一致的顏色邏輯
function cardStyle(booking: Booking): React.CSSProperties {
  const color = booking.practitioner?.color ?? '#6366f1'
  if (booking.status === 'completed') return { backgroundColor: '#94a3b8' }
  if (booking.status === 'no_show') return { backgroundColor: color, opacity: 0.35 }
  if (booking.status === 'cancelled') return { backgroundColor: '#94a3b8', opacity: 0.5 }
  return { backgroundColor: color }
}

const STATUS_LABEL: Record<string, string> = {
  confirmed: '已確認',
  pending: '待確認',
  completed: '已完課',
  cancelled: '已取消',
  no_show: '未到',
}

const CELL_WIDTH = 80   // 每小時寬度（px）
const ROW_HEIGHT = 56   // 每位老師的列高（px）
const LABEL_WIDTH = 160 // 左側老師欄寬

interface GanttPageProps {
  selectedPractitionerId?: string | null
  defaultDate?: Date
  startHour?: number
  endHour?: number
}

export default function GanttPage({
  selectedPractitionerId,
  defaultDate,
  startHour = 9,
  endHour = 21,
}: GanttPageProps) {
  const totalHours = endHour - startHour
  const [bookings, setBookings] = useState<Booking[]>([])
  const [practitioners, setPractitioners] = useState<Practitioner[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(defaultDate || new Date())
  const [tooltip, setTooltip] = useState<{ booking: Booking; x: number; y: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadData() }, [selectedDate, selectedPractitionerId])

  async function loadData() {
    setIsLoading(true)
    try {
      let practQuery = supabase
        .from('practitioners')
        .select('id, full_name, color')
        .eq('active', true)
        .order('full_name', { ascending: true })
      if (selectedPractitionerId) practQuery = practQuery.eq('id', selectedPractitionerId)
      const { data: practData } = await practQuery
      setPractitioners(practData || [])

      const startOfDay = new Date(selectedDate)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(selectedDate)
      endOfDay.setHours(23, 59, 59, 999)

      let bookQuery = supabase
        .from('bookings')
        .select(`
          id, start_time, end_time, status, client_id, practitioner_id, service_id, price,
          client:clients(full_name),
          practitioner:practitioners(id, full_name, color),
          service:services(name)
        `)
        .gte('start_time', startOfDay.toISOString())
        .lt('start_time', endOfDay.toISOString())
        .in('status', ['pending', 'confirmed', 'completed', 'no_show'])
      if (selectedPractitionerId) bookQuery = bookQuery.eq('practitioner_id', selectedPractitionerId)
      const { data: bookData } = await bookQuery.order('start_time', { ascending: true })
      setBookings(bookData || [])
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }

  // 計算卡片的 left 和 width（以 px 為單位）
  function getPosition(booking: Booking): { left: number; width: number } | null {
    const start = new Date(booking.start_time)
    const end = new Date(booking.end_time)
    const startH = start.getHours() + start.getMinutes() / 60
    const endH = end.getHours() + end.getMinutes() / 60
    if (startH >= endHour || endH <= startHour) return null
    const clampedStart = Math.max(startH, startHour)
    const clampedEnd = Math.min(endH, endHour)
    return {
      left: (clampedStart - startHour) * CELL_WIDTH,
      width: Math.max((clampedEnd - clampedStart) * CELL_WIDTH - 2, 30),
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

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="max-w-full px-6 py-6">

        {/* 標題列 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">甘特圖視圖</h1>
            <p className="text-sm text-slate-500 mt-1">按從業人員查看每日預約安排</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handlePrev} className="p-2 hover:bg-slate-100 rounded-lg transition text-slate-500 hover:text-slate-800">
              <ChevronLeft size={18} />
            </button>
            <div className="text-center min-w-44">
              <p className="text-lg font-semibold text-slate-900">{formatDate(selectedDate)}</p>
              <p className="text-xs text-slate-400 mt-0.5">{bookings.length} 筆預約</p>
            </div>
            <button onClick={handleNext} className="p-2 hover:bg-slate-100 rounded-lg transition text-slate-500 hover:text-slate-800">
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
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto" ref={containerRef}>
            <div style={{ minWidth: LABEL_WIDTH + totalHours * CELL_WIDTH }}>

              {/* 標題列（老師欄 + 時間軸）*/}
              <div className="flex border-b border-slate-200 bg-slate-50 sticky top-0 z-20">
                <div
                  className="flex-shrink-0 flex items-center px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-r border-slate-200"
                  style={{ width: LABEL_WIDTH, height: 40 }}
                >
                  從業人員
                </div>
                <div className="flex relative">
                  {Array.from({ length: totalHours }).map((_, i) => (
                    <div
                      key={i}
                      className="border-r border-slate-200 flex items-center justify-center text-xs font-medium text-slate-400"
                      style={{ width: CELL_WIDTH, height: 40 }}
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
                practitioners.map((p) => {
                  const pBookings = bookings.filter(b => b.practitioner_id === p.id)
                  return (
                    <div key={p.id} className="flex border-b border-slate-100 last:border-0" style={{ height: ROW_HEIGHT }}>
                      {/* 老師名稱 */}
                      <div
                        className="flex-shrink-0 flex items-center px-4 gap-2 border-r border-slate-200 bg-white"
                        style={{ width: LABEL_WIDTH }}
                      >
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: p.color ?? '#6366f1' }}
                        />
                        <span className="text-sm font-medium text-slate-700 truncate">{p.full_name}</span>
                      </div>

                      {/* 時間格子 + 卡片 */}
                      <div className="relative flex" style={{ width: totalHours * CELL_WIDTH }}>
                        {/* 格線背景 */}
                        {Array.from({ length: totalHours }).map((_, i) => (
                          <div
                            key={i}
                            className="border-r border-slate-100 h-full"
                            style={{ width: CELL_WIDTH }}
                          />
                        ))}

                        {/* 現在時間線 */}
                        {(() => {
                          const now = new Date()
                          const isSameDay = now.toDateString() === selectedDate.toDateString()
                          if (!isSameDay) return null
                          const nowH = now.getHours() + now.getMinutes() / 60
                          if (nowH < startHour || nowH > endHour) return null
                          return (
                            <div
                              className="absolute top-0 bottom-0 w-px bg-red-400 z-10 pointer-events-none"
                              style={{ left: (nowH - startHour) * CELL_WIDTH }}
                            />
                          )
                        })()}

                        {/* 預約卡片 */}
                        {pBookings.map(b => {
                          const pos = getPosition(b)
                          if (!pos) return null
                          const durationMin = Math.round((new Date(b.end_time).getTime() - new Date(b.start_time).getTime()) / 60000)
                          const isNarrow = pos.width < 72

                          return (
                            <div
                              key={b.id}
                              className="absolute top-1 bottom-1 rounded-lg text-white text-xs font-medium overflow-hidden cursor-pointer hover:brightness-110 hover:shadow-md transition-all"
                              style={{ left: pos.left + 1, width: pos.width, ...cardStyle(b) }}
                              onMouseEnter={e => {
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                                setTooltip({ booking: b, x: rect.left, y: rect.bottom + 6 })
                              }}
                              onMouseLeave={() => setTooltip(null)}
                            >
                              <div className="px-1.5 py-1 h-full flex flex-col justify-center leading-tight">
                                {isNarrow ? (
                                  <div className="truncate font-semibold text-[10px]">{b.client?.full_name}</div>
                                ) : (
                                  <>
                                    <div className="truncate font-semibold">{b.client?.full_name}</div>
                                    <div className="truncate opacity-90 text-[10px]">
                                      {formatTime(b.start_time)} · {durationMin}分鐘
                                    </div>
                                    {pos.width > 100 && (
                                      <div className="truncate opacity-80 text-[10px]">{b.service?.name}</div>
                                    )}
                                  </>
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
        <div className="mt-4 flex flex-wrap gap-4 px-1">
          {[
            { label: '已確認', color: '#6366f1' },
            { label: '待確認', color: '#f59e0b' },
            { label: '已完課', color: '#94a3b8' },
            { label: '未到', color: '#94a3b8' },
          ].map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
              <span className="text-xs text-slate-500">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-white rounded-xl shadow-xl border border-slate-100 p-3 text-xs pointer-events-none"
          style={{ left: tooltip.x, top: tooltip.y, minWidth: 180 }}
        >
          <p className="font-semibold text-slate-900 mb-1">{tooltip.booking.client?.full_name}</p>
          <p className="text-slate-500">{tooltip.booking.service?.name}</p>
          <p className="text-slate-500 mt-0.5">
            {formatTime(tooltip.booking.start_time)} – {formatTime(tooltip.booking.end_time)}
          </p>
          <p className="mt-1 font-medium" style={cardStyle(tooltip.booking)}>
            <span className="text-white px-1.5 py-0.5 rounded">
              {STATUS_LABEL[tooltip.booking.status]}
            </span>
          </p>
        </div>
      )}
    </div>
  )
}
