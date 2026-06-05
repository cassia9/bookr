import { useEffect, useState } from 'react'
import { Calendar, X, Clock, MapPin, Phone } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/cn'

interface Booking {
  id: string
  client_name: string
  client_phone: string
  service_name: string
  start_time: string
  end_time: string
  practitioner_name: string
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled'
  notes?: string
}

interface Client {
  id: string
  name: string
  phone: string
  email: string
  visit_count: number
  notes?: string
}

type ViewMode = 'month' | 'week' | 'day'

interface CalendarPageProps {
  selectedPractitionerId?: string | null
  defaultView?: ViewMode
  defaultDate?: Date
}

export default function CalendarPage({
  selectedPractitionerId,
  defaultView = 'week',
  defaultDate,
}: CalendarPageProps) {
  const [view, setView] = useState<ViewMode>(defaultView)
  const [currentDate, setCurrentDate] = useState(defaultDate || new Date())
  const [bookings, setBookings] = useState<Booking[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [showDrawer, setShowDrawer] = useState(false)

  // 載入預約資料
  useEffect(() => {
    loadBookings()
  }, [currentDate, selectedPractitionerId])

  const loadBookings = async () => {
    setIsLoading(true)
    try {
      let query = supabase
        .from('bookings')
        .select(`
          id,
          client_name,
          client_phone: clients!inner(phone),
          service_name: services!inner(name),
          start_time,
          end_time,
          practitioner_name: practitioners!inner(full_name),
          status,
          notes
        `)

      // 如果選擇了特定從業人員，則篩選
      if (selectedPractitionerId) {
        query = query.eq('practitioner_id', selectedPractitionerId)
      }

      const { data, error } = await query.order('start_time', { ascending: true })

      if (error) throw error
      setBookings(data || [])
    } catch (error) {
      console.error('Failed to load bookings:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSelectBooking = async (booking: Booking) => {
    setSelectedBooking(booking)
    // 載入客戶詳情
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('phone', booking.client_phone)
        .single()

      if (!error && data) {
        setSelectedClient(data)
      }
    } catch (err) {
      console.error('Failed to load client details:', err)
    }
    setShowDrawer(true)
  }

  // 計算要顯示的日期範圍
  const getDatesForView = () => {
    const dates = []
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const date = currentDate.getDate()

    if (view === 'month') {
      // 月視圖：整個月
      const firstDay = new Date(year, month, 1)
      const lastDay = new Date(year, month + 1, 0)
      for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
        dates.push(new Date(d))
      }
    } else if (view === 'week') {
      // 週視圖：當周 7 天
      const curr = new Date(year, month, date)
      const first = new Date(curr)
      first.setDate(first.getDate() - curr.getDay())
      for (let i = 0; i < 7; i++) {
        const d = new Date(first)
        d.setDate(d.getDate() + i)
        dates.push(d)
      }
    } else {
      // 日視圖：當日
      dates.push(new Date(year, month, date))
    }

    return dates
  }

  const isDateInRange = (bookingDate: string, dateToCheck: Date) => {
    const bDate = new Date(bookingDate)
    return bDate.toDateString() === dateToCheck.toDateString()
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      confirmed: 'bg-green-100 border-green-300 text-green-900',
      pending: 'bg-yellow-100 border-yellow-300 text-yellow-900',
      completed: 'bg-blue-100 border-blue-300 text-blue-900',
      cancelled: 'bg-red-100 border-red-300 text-red-900',
    }
    return colors[status] || colors.pending
  }

  const datesForView = getDatesForView()
  const monthName = currentDate.toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'long',
  })

  return (
    <div className="p-6 space-y-6">
      {/* 標題和視圖切換 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Calendar size={24} className="text-indigo-600" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">行事曆</h1>
            <p className="text-sm text-slate-500 mt-1">{monthName}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)))}
            className="px-3 py-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            ←
          </button>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg font-medium text-sm hover:bg-indigo-100"
          >
            今天
          </button>
          <button
            onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)))}
            className="px-3 py-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            →
          </button>
        </div>

        <div className="flex items-center bg-slate-100 rounded-lg p-1 gap-1">
          {(['month', 'week', 'day'] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                'px-4 py-2 rounded-md text-sm font-medium transition-colors',
                view === v
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              )}
            >
              {v === 'month' ? '月' : v === 'week' ? '週' : '日'}
            </button>
          ))}
        </div>
      </div>

      {/* 行事曆視圖 */}
      {isLoading ? (
        <div className="flex justify-center items-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          {view === 'month' ? (
            // 月視圖：日期網格
            <div>
              <div className="grid grid-cols-7 gap-2 mb-4">
                {['日', '一', '二', '三', '四', '五', '六'].map((day) => (
                  <div
                    key={day}
                    className="text-center text-xs font-semibold text-slate-500 py-2"
                  >
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {datesForView.map((date, idx) => {
                  const dayBookings = bookings.filter((b) =>
                    isDateInRange(b.start_time, date)
                  )
                  return (
                    <div
                      key={idx}
                      className={cn(
                        'min-h-32 p-2 rounded-lg border',
                        date.getMonth() === currentDate.getMonth()
                          ? 'bg-white border-slate-200'
                          : 'bg-slate-50 border-slate-100'
                      )}
                    >
                      <div className="text-xs font-semibold text-slate-600 mb-2">
                        {date.getDate()}
                      </div>
                      <div className="space-y-1">
                        {dayBookings.slice(0, 2).map((booking) => (
                          <button
                            key={booking.id}
                            onClick={() => handleSelectBooking(booking)}
                            className={cn(
                              'w-full text-xs p-1 rounded border-l-2 cursor-pointer hover:shadow-md transition-shadow',
                              getStatusColor(booking.status)
                            )}
                          >
                            <div className="font-medium truncate">
                              {booking.client_name}
                            </div>
                            <div className="text-xs opacity-75">
                              {booking.service_name}
                            </div>
                          </button>
                        ))}
                        {dayBookings.length > 2 && (
                          <div className="text-xs text-slate-500 font-medium">
                            +{dayBookings.length - 2} 更多
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : view === 'week' ? (
            // 週視圖：時間軸
            <div className="space-y-2">
              <div className="grid grid-cols-8 gap-2">
                <div className="text-xs font-semibold text-slate-500">時間</div>
                {datesForView.map((date) => (
                  <div key={date.toISOString()} className="text-center">
                    <div className="text-xs font-semibold text-slate-700">
                      {date.toLocaleDateString('zh-TW', {
                        weekday: 'short',
                        month: 'numeric',
                        day: 'numeric',
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {Array.from({ length: 12 }, (_, i) => 9 + i).map((hour) => (
                <div key={hour} className="grid grid-cols-8 gap-2 items-start border-t pt-2">
                  <div className="text-xs font-medium text-slate-500">{hour}:00</div>
                  {datesForView.map((date) => {
                    const hourBookings = bookings.filter((b) => {
                      const bDate = new Date(b.start_time)
                      return (
                        isDateInRange(b.start_time, date) &&
                        bDate.getHours() === hour
                      )
                    })
                    return (
                      <div key={date.toISOString()} className="space-y-1">
                        {hourBookings.map((booking) => (
                          <button
                            key={booking.id}
                            onClick={() => handleSelectBooking(booking)}
                            className={cn(
                              'w-full text-xs p-1 rounded border-l-2 cursor-pointer hover:shadow-md transition-shadow',
                              getStatusColor(booking.status)
                            )}
                          >
                            <div className="font-medium truncate">
                              {booking.client_name}
                            </div>
                          </button>
                        ))}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          ) : (
            // 日視圖：詳細時間軸
            <div className="space-y-4">
              <div className="text-lg font-bold text-slate-900">
                {currentDate.toLocaleDateString('zh-TW', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </div>
              <div className="space-y-3">
                {bookings
                  .filter((b) => isDateInRange(b.start_time, currentDate))
                  .sort(
                    (a, b) =>
                      new Date(a.start_time).getTime() -
                      new Date(b.start_time).getTime()
                  )
                  .map((booking) => (
                    <button
                      key={booking.id}
                      onClick={() => handleSelectBooking(booking)}
                      className={cn(
                        'w-full text-left p-4 rounded-lg border-l-4 cursor-pointer hover:shadow-md transition-shadow',
                        getStatusColor(booking.status)
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-semibold text-lg">
                            {booking.client_name}
                          </h3>
                          <p className="text-sm opacity-75 mt-1">
                            {booking.service_name}
                          </p>
                        </div>
                        <span className="text-xs font-medium px-2 py-1 bg-white rounded">
                          {booking.status === 'confirmed'
                            ? '已確認'
                            : booking.status === 'pending'
                            ? '待確認'
                            : booking.status === 'completed'
                            ? '已完成'
                            : '已取消'}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-3 text-sm opacity-75">
                        <div className="flex items-center gap-1">
                          <Clock size={14} />
                          {new Date(booking.start_time).toLocaleTimeString(
                            'zh-TW',
                            { hour: '2-digit', minute: '2-digit' }
                          )}{' '}
                          -{' '}
                          {new Date(booking.end_time).toLocaleTimeString('zh-TW', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                        <div className="flex items-center gap-1">
                          <MapPin size={14} />
                          {booking.practitioner_name}
                        </div>
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 客戶詳情側邊抽屜 */}
      {showDrawer && (
        <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setShowDrawer(false)} />
      )}
      <div
        className={cn(
          'fixed inset-y-0 right-0 w-96 bg-white shadow-xl transition-transform duration-300 z-50 overflow-y-auto',
          showDrawer ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-900">預約詳情</h2>
            <button
              onClick={() => setShowDrawer(false)}
              className="p-2 hover:bg-slate-100 rounded-lg"
            >
              <X size={20} />
            </button>
          </div>

          {selectedBooking && (
            <div className="space-y-6">
              {/* 預約資訊 */}
              <div>
                <h3 className="font-semibold text-slate-900 mb-3">預約資訊</h3>
                <div className="space-y-2 text-sm">
                  <div>
                    <div className="text-slate-500">課程</div>
                    <div className="font-medium">{selectedBooking.service_name}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">服務人員</div>
                    <div className="font-medium">
                      {selectedBooking.practitioner_name}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">時間</div>
                    <div className="font-medium">
                      {new Date(selectedBooking.start_time).toLocaleString('zh-TW')} ~{' '}
                      {new Date(selectedBooking.end_time).toLocaleTimeString('zh-TW')}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">狀態</div>
                    <div
                      className={cn(
                        'font-medium inline-block px-2 py-1 rounded text-xs mt-1',
                        selectedBooking.status === 'confirmed'
                          ? 'bg-green-100 text-green-800'
                          : selectedBooking.status === 'pending'
                          ? 'bg-yellow-100 text-yellow-800'
                          : selectedBooking.status === 'completed'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-red-100 text-red-800'
                      )}
                    >
                      {selectedBooking.status === 'confirmed'
                        ? '已確認'
                        : selectedBooking.status === 'pending'
                        ? '待確認'
                        : selectedBooking.status === 'completed'
                        ? '已完成'
                        : '已取消'}
                    </div>
                  </div>
                </div>
              </div>

              {/* 客戶資訊 */}
              {selectedClient && (
                <div>
                  <h3 className="font-semibold text-slate-900 mb-3">客戶資訊</h3>
                  <div className="space-y-2 text-sm">
                    <div>
                      <div className="text-slate-500">姓名</div>
                      <div className="font-medium">{selectedClient.name}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">電話</div>
                      <div className="font-medium flex items-center gap-2">
                        <Phone size={14} />
                        {selectedClient.phone}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Email</div>
                      <div className="font-medium">{selectedClient.email || '-'}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">來店次數</div>
                      <div className="font-medium">{selectedClient.visit_count}</div>
                    </div>
                    {selectedClient.notes && (
                      <div>
                        <div className="text-slate-500">備註</div>
                        <div className="font-medium">{selectedClient.notes}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 備註 */}
              {selectedBooking.notes && (
                <div>
                  <h3 className="font-semibold text-slate-900 mb-3">預約備註</h3>
                  <p className="text-sm text-slate-700">
                    {selectedBooking.notes}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
