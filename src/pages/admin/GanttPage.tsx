import { useEffect, useState } from 'react'
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
  client?: { full_name: string }
  practitioner?: { full_name: string }
  service?: { name: string }
}

interface Practitioner {
  id: string
  full_name: string
}

const statusColorMap = {
  confirmed: 'bg-success-light border-l-4 border-success',
  pending: 'bg-warning-light border-l-4 border-warning',
  completed: 'bg-info-light border-l-4 border-info',
  cancelled: 'bg-slate-100 border-l-4 border-slate-400',
  no_show: 'bg-slate-100 border-l-4 border-slate-400',
}

const statusTextColorMap = {
  confirmed: 'text-success',
  pending: 'text-warning',
  completed: 'text-info',
  cancelled: 'text-slate-600',
  no_show: 'text-slate-600',
}

const HOUR_HEIGHT = 80

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
  const BUSINESS_HOURS = { start: startHour, end: endHour }
  const [bookings, setBookings] = useState<Booking[]>([])
  const [practitioners, setPractitioners] = useState<Practitioner[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(defaultDate || new Date())
  const [hoveredBooking, setHoveredBooking] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [selectedDate, selectedPractitionerId])

  const loadData = async () => {
    setIsLoading(true)
    try {
      // 取得從業人員列表
      let practQuery = supabase
        .from('practitioners')
        .select('id, full_name')
        .eq('active', true)
        .order('full_name', { ascending: true })

      // 如果選擇了特定從業人員，則只顯示該人員
      if (selectedPractitionerId) {
        practQuery = practQuery.eq('id', selectedPractitionerId)
      }

      const { data: practitionersData, error: practError } = await practQuery

      if (practError) throw practError
      setPractitioners(practitionersData || [])

      // 取得該日的預約
      const startOfDay = new Date(selectedDate)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(selectedDate)
      endOfDay.setHours(23, 59, 59, 999)

      let bookQuery = supabase
        .from('bookings')
        .select(`
          id,
          start_time,
          end_time,
          status,
          client_id,
          practitioner_id,
          service_id,
          client:clients(full_name),
          practitioner:practitioners(full_name),
          service:services(name)
        `)
        .gte('start_time', startOfDay.toISOString())
        .lt('start_time', endOfDay.toISOString())
        .in('status', ['pending', 'confirmed', 'completed'])

      // 如果選擇了特定從業人員，則篩選
      if (selectedPractitionerId) {
        bookQuery = bookQuery.eq('practitioner_id', selectedPractitionerId)
      }

      const { data: bookingsData, error: bookError } = await bookQuery.order('start_time', { ascending: true })

      if (bookError) throw bookError
      setBookings(bookingsData || [])
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const getBookingPosition = (booking: Booking) => {
    const startDate = new Date(booking.start_time)
    const endDate = new Date(booking.end_time)
    const hours = startDate.getHours()
    const minutes = startDate.getMinutes()

    if (hours < BUSINESS_HOURS.start || hours >= BUSINESS_HOURS.end) {
      return null
    }

    const topPixels = (hours - BUSINESS_HOURS.start) * HOUR_HEIGHT + (minutes / 60) * HOUR_HEIGHT
    const durationMs = endDate.getTime() - startDate.getTime()
    const durationMinutes = durationMs / (1000 * 60)
    const heightPixels = (durationMinutes / 60) * HOUR_HEIGHT

    return { top: topPixels, height: Math.max(heightPixels, 40) }
  }

  const getPractitionerBookings = (practitionerId: string) => {
    return bookings.filter(b => b.practitioner_id === practitionerId)
  }

  const handlePrevDay = () => {
    const newDate = new Date(selectedDate)
    newDate.setDate(newDate.getDate() - 1)
    setSelectedDate(newDate)
  }

  const handleNextDay = () => {
    const newDate = new Date(selectedDate)
    newDate.setDate(newDate.getDate() + 1)
    setSelectedDate(newDate)
  }

  const handleToday = () => {
    setSelectedDate(new Date())
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
    })
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('zh-TW', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6 flex items-center justify-center">
        <div className="animate-pulse max-w-7xl w-full">
          <div className="h-8 bg-slate-200 rounded w-1/4 mb-4"></div>
          <div className="h-96 bg-slate-200 rounded"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="max-w-7xl mx-auto w-full px-6 py-6">
        {/* 標題和日期導航 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-text-primary">甘特圖視圖</h1>
            <p className="text-text-secondary mt-2">按從業人員查看每日預約安排</p>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={handlePrevDay}
              className="p-2 hover:bg-surface-secondary rounded-lg transition text-text-secondary hover:text-text-primary"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="text-center min-w-40">
              <p className="text-2xl font-semibold text-text-primary">
                {formatDate(selectedDate)}
              </p>
              <p className="text-sm text-text-secondary mt-1">
                {bookings.length} 筆預約
              </p>
            </div>

            <button
              onClick={handleNextDay}
              className="p-2 hover:bg-surface-secondary rounded-lg transition text-text-secondary hover:text-text-primary"
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            <button
              onClick={handleToday}
              className="px-4 py-2 bg-black text-white rounded-lg hover:bg-primary-hover transition font-medium shadow-md hover:shadow-lg"
            >
              回到今天
            </button>
          </div>
        </div>

        {/* 甘特圖 */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-slate-200">
          <div className="overflow-x-auto">
            <div className="flex">
              {/* 左側：從業人員列表 */}
              <div className="w-48 border-r border-slate-200 bg-white flex-shrink-0">
                <div className="sticky top-0 bg-white border-b border-slate-200 h-16 flex items-center px-4 shadow-sm">
                  <h3 className="font-semibold text-text-primary text-sm">從業人員</h3>
                </div>
                <div className="divide-y divide-slate-200">
                  {practitioners.length === 0 ? (
                    <div className="p-4 text-center text-text-secondary text-sm">
                      暫無從業人員
                    </div>
                  ) : (
                    practitioners.map(practitioner => (
                      <div
                        key={practitioner.id}
                        className="px-4 py-3 text-sm font-medium text-text-primary flex items-center border-t border-slate-200"
                        style={{ height: Math.max(200, HOUR_HEIGHT * (BUSINESS_HOURS.end - BUSINESS_HOURS.start)) }}
                      >
                        {practitioner.full_name}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* 右側：時間網格和預約 */}
              <div className="flex-1">
                {/* 時間刻度 */}
                <div className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                  <div className="flex">
                    {Array.from({ length: BUSINESS_HOURS.end - BUSINESS_HOURS.start }).map(
                      (_, i) => (
                        <div
                          key={i}
                          className="border-r border-slate-200 text-xs font-medium text-text-secondary text-center py-3"
                          style={{ width: HOUR_HEIGHT }}
                        >
                          {String(BUSINESS_HOURS.start + i).padStart(2, '0')}:00
                        </div>
                      )
                    )}
                  </div>
                </div>

                {/* 預約行 */}
                {practitioners.length === 0 ? (
                  <div className="p-8 text-center text-text-secondary">
                    暫無從業人員資料
                  </div>
                ) : (
                  practitioners.map(practitioner => {
                    const practitionerBookings = getPractitionerBookings(practitioner.id)
                    return (
                      <div key={practitioner.id} className="border-b border-slate-200 relative flex items-stretch">
                        {/* 小時網格背景 */}
                        <div className="flex w-full">
                          {Array.from({ length: BUSINESS_HOURS.end - BUSINESS_HOURS.start }).map(
                            (_, i) => (
                              <div
                                key={i}
                                className="border-r border-slate-100"
                                style={{ width: HOUR_HEIGHT, height: 200 }}
                              ></div>
                            )
                          )}
                        </div>

                        {/* 預約卡片層 */}
                        <div className="absolute inset-0 pointer-events-none">
                          {practitionerBookings.map(booking => {
                            const position = getBookingPosition(booking)
                            if (!position) return null

                            return (
                              <div
                                key={booking.id}
                                className={`absolute left-0 right-0 mx-1 rounded-md p-2 text-xs cursor-pointer transition-all pointer-events-auto overflow-hidden ${
                                  statusColorMap[booking.status]
                                } ${hoveredBooking === booking.id ? 'shadow-lg ring-2 ring-primary-hover scale-105 z-20' : 'z-10'}`}
                                style={{
                                  top: `${position.top}px`,
                                  height: `${position.height}px`,
                                }}
                                onMouseEnter={() => setHoveredBooking(booking.id)}
                                onMouseLeave={() => setHoveredBooking(null)}
                              >
                                <div className={`font-semibold ${statusTextColorMap[booking.status]} truncate text-xs leading-tight`}>
                                  {booking.client?.full_name || '未知客戶'}
                                </div>
                                <div className={`${statusTextColorMap[booking.status]} mt-0.5 text-xs leading-tight`}>
                                  {formatTime(booking.start_time)} ({Math.round((new Date(booking.end_time).getTime() - new Date(booking.start_time).getTime()) / (1000 * 60))}分鐘)
                                </div>
                                <div className={`${statusTextColorMap[booking.status]} truncate mt-0.5 text-xs leading-tight`}>
                                  {booking.service?.name || '未知服務'}
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
        </div>

        {/* 圖例 */}
        <div className="mt-6 flex flex-wrap gap-6 p-4 bg-white rounded-lg shadow-md border border-slate-200">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-success-light border-l-4 border-success rounded-sm"></div>
            <span className="text-sm text-text-primary font-medium">已確認</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-warning-light border-l-4 border-warning rounded-sm"></div>
            <span className="text-sm text-text-primary font-medium">待確認</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-info-light border-l-4 border-info rounded-sm"></div>
            <span className="text-sm text-text-primary font-medium">已完成</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-slate-100 border-l-4 border-slate-400 rounded-sm"></div>
            <span className="text-sm text-text-primary font-medium">已取消</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-slate-100 border-l-4 border-slate-400 rounded-sm"></div>
            <span className="text-sm text-text-primary font-medium">未到</span>
          </div>
        </div>
      </div>
    </div>
  )
}
