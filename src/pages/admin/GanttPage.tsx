import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Booking {
  id: string
  booking_time: string
  duration_minutes: number
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
  client_id: string
  practitioner_id: string
  service_id: string
  client?: { name: string }
  practitioner?: { name: string }
  service?: { name: string }
}

interface Practitioner {
  id: string
  name: string
}

const statusColorMap = {
  confirmed: 'bg-green-100 border-green-300',
  pending: 'bg-yellow-100 border-yellow-300',
  completed: 'bg-blue-100 border-blue-300',
  cancelled: 'bg-gray-100 border-gray-300',
  no_show: 'bg-red-100 border-red-300',
}

const statusTextColorMap = {
  confirmed: 'text-green-900',
  pending: 'text-yellow-900',
  completed: 'text-blue-900',
  cancelled: 'text-gray-900',
  no_show: 'text-red-900',
}

const HOUR_HEIGHT = 80
const BUSINESS_HOURS = { start: 9, end: 20 }

interface GanttPageProps {
  selectedPractitionerId?: string | null
  defaultDate?: Date
}

export default function GanttPage({
  selectedPractitionerId,
  defaultDate,
}: GanttPageProps) {
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
        .select('id, name')
        .order('name', { ascending: true })

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
          booking_time,
          duration_minutes,
          status,
          client_id,
          practitioner_id,
          service_id,
          client:clients(name),
          practitioner:practitioners(name),
          service:services(name)
        `)
        .gte('booking_time', startOfDay.toISOString())
        .lt('booking_time', endOfDay.toISOString())
        .in('status', ['pending', 'confirmed', 'completed'])

      // 如果選擇了特定從業人員，則篩選
      if (selectedPractitionerId) {
        bookQuery = bookQuery.eq('practitioner_id', selectedPractitionerId)
      }

      const { data: bookingsData, error: bookError } = await bookQuery.order('booking_time', { ascending: true })

      if (bookError) throw bookError
      setBookings(bookingsData || [])
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const getBookingPosition = (booking: Booking) => {
    const bookingDate = new Date(booking.booking_time)
    const hours = bookingDate.getHours()
    const minutes = bookingDate.getMinutes()

    if (hours < BUSINESS_HOURS.start || hours >= BUSINESS_HOURS.end) {
      return null
    }

    const topPixels = (hours - BUSINESS_HOURS.start) * HOUR_HEIGHT + (minutes / 60) * HOUR_HEIGHT
    const heightPixels = (booking.duration_minutes / 60) * HOUR_HEIGHT

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
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-96 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* 標題和日期導航 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">甘特圖視圖</h1>
            <p className="text-gray-600 mt-2">按從業人員查看每日預約安排</p>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={handlePrevDay}
              className="p-2 hover:bg-gray-200 rounded-lg transition"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="text-center min-w-40">
              <p className="text-2xl font-semibold text-gray-900">
                {formatDate(selectedDate)}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {bookings.length} 筆預約
              </p>
            </div>

            <button
              onClick={handleNextDay}
              className="p-2 hover:bg-gray-200 rounded-lg transition"
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            <button
              onClick={handleToday}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              回到今天
            </button>
          </div>
        </div>

        {/* 甘特圖 */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <div className="flex">
              {/* 左側：從業人員列表 */}
              <div className="w-48 border-r bg-gray-50 flex-shrink-0">
                <div className="sticky top-0 bg-gray-50 border-b h-16 flex items-center px-4">
                  <h3 className="font-semibold text-gray-900 text-sm">從業人員</h3>
                </div>
                <div className="divide-y">
                  {practitioners.length === 0 ? (
                    <div className="p-4 text-center text-gray-500 text-sm">
                      暫無從業人員
                    </div>
                  ) : (
                    practitioners.map(practitioner => (
                      <div
                        key={practitioner.id}
                        className="px-4 py-3 text-sm font-medium text-gray-900 flex items-center"
                        style={{ height: Math.max(200, HOUR_HEIGHT * (BUSINESS_HOURS.end - BUSINESS_HOURS.start)) }}
                      >
                        {practitioner.name}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* 右側：時間網格和預約 */}
              <div className="flex-1">
                {/* 時間刻度 */}
                <div className="bg-gray-50 border-b sticky top-0 z-10">
                  <div className="flex">
                    {Array.from({ length: BUSINESS_HOURS.end - BUSINESS_HOURS.start }).map(
                      (_, i) => (
                        <div
                          key={i}
                          className="border-r text-xs font-medium text-gray-700 text-center py-2"
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
                  <div className="p-8 text-center text-gray-500">
                    暫無從業人員資料
                  </div>
                ) : (
                  practitioners.map(practitioner => {
                    const practitionerBookings = getPractitionerBookings(practitioner.id)
                    return (
                      <div key={practitioner.id} className="border-b relative flex items-stretch">
                        {/* 小時網格背景 */}
                        <div className="flex w-full">
                          {Array.from({ length: BUSINESS_HOURS.end - BUSINESS_HOURS.start }).map(
                            (_, i) => (
                              <div
                                key={i}
                                className="border-r border-gray-200"
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
                                className={`absolute left-0 right-0 mx-1 border rounded p-1 text-xs cursor-pointer transition-all pointer-events-auto ${
                                  statusColorMap[booking.status]
                                } ${hoveredBooking === booking.id ? 'shadow-lg ring-2 ring-blue-400' : ''}`}
                                style={{
                                  top: `${position.top}px`,
                                  height: `${position.height}px`,
                                  zIndex: hoveredBooking === booking.id ? 20 : 10,
                                }}
                                onMouseEnter={() => setHoveredBooking(booking.id)}
                                onMouseLeave={() => setHoveredBooking(null)}
                              >
                                <div className={`font-semibold ${statusTextColorMap[booking.status]} truncate`}>
                                  {booking.client?.name || '未知客戶'}
                                </div>
                                <div className={`text-xs ${statusTextColorMap[booking.status]} mt-0.5`}>
                                  {formatTime(booking.booking_time)} ({booking.duration_minutes}分鐘)
                                </div>
                                <div className={`text-xs ${statusTextColorMap[booking.status]} truncate mt-0.5`}>
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
        <div className="mt-6 flex flex-wrap gap-6 p-4 bg-white rounded-lg shadow">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-100 border border-green-300 rounded"></div>
            <span className="text-sm text-gray-700">已確認</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-yellow-100 border border-yellow-300 rounded"></div>
            <span className="text-sm text-gray-700">待確認</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-100 border border-blue-300 rounded"></div>
            <span className="text-sm text-gray-700">已完成</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-100 border border-gray-300 rounded"></div>
            <span className="text-sm text-gray-700">已取消</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-100 border border-red-300 rounded"></div>
            <span className="text-sm text-gray-700">未到</span>
          </div>
        </div>
      </div>
    </div>
  )
}
