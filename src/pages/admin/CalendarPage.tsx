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
          practitioner_name: practitioners!inner(name),
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
      confirmed: 'bg-success-light text-success border-l-success',
      pending: 'bg-warning-light text-warning border-l-warning',
      completed: 'bg-info-light text-info border-l-info',
      cancelled: 'bg-slate-100 text-slate-400 border-l-slate-300',
    }
    return colors[status] || colors.pending
  }

  const datesForView = getDatesForView()
  const monthName = currentDate.toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'long',
  })

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* 頂部控制欄 */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              {view === 'month' ? monthName : currentDate.toLocaleDateString('zh-TW', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </h2>
          </div>

          {/* 日期導航 */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const newDate = new Date(currentDate)
                if (view === 'month') newDate.setMonth(newDate.getMonth() - 1)
                else if (view === 'week') newDate.setDate(newDate.getDate() - 7)
                else newDate.setDate(newDate.getDate() - 1)
                setCurrentDate(newDate)
              }}
              className="p-2 hover:bg-surface-secondary rounded-lg transition text-text-secondary hover:text-text-primary"
              title="上一個"
            >
              ←
            </button>

            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-4 py-2 bg-black text-white rounded-lg hover:bg-primary-hover shadow-md hover:shadow-lg transition font-medium text-sm"
            >
              今天
            </button>

            <button
              onClick={() => {
                const newDate = new Date(currentDate)
                if (view === 'month') newDate.setMonth(newDate.getMonth() + 1)
                else if (view === 'week') newDate.setDate(newDate.getDate() + 7)
                else newDate.setDate(newDate.getDate() + 1)
                setCurrentDate(newDate)
              }}
              className="p-2 hover:bg-surface-secondary rounded-lg transition text-text-secondary hover:text-text-primary"
              title="下一個"
            >
              →
            </button>
          </div>

          {/* 視圖切換 */}
          <div className="flex items-center bg-surface-secondary rounded-lg p-1 gap-1">
            {(['month', 'week', 'day'] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                  view === v
                    ? 'bg-black text-white shadow-sm'
                    : 'text-text-secondary hover:text-text-primary hover:bg-white'
                )}
              >
                {v === 'month' ? '月' : v === 'week' ? '週' : '日'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 行事曆內容區 */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="flex justify-center items-center h-96">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-lg border-0">
          {view === 'month' ? (
            // 月視圖：日期網格
            <div className="p-6">
              <div className="grid grid-cols-7 gap-3 mb-4">
                {['日', '一', '二', '三', '四', '五', '六'].map((day) => (
                  <div
                    key={day}
                    className="text-center text-xs font-semibold text-text-secondary py-2"
                  >
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-3">
                {datesForView.map((date, idx) => {
                  const dayBookings = bookings.filter((b) =>
                    isDateInRange(b.start_time, date)
                  )
                  return (
                    <div
                      key={idx}
                      className={cn(
                        'min-h-24 p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md',
                        date.getMonth() === currentDate.getMonth()
                          ? 'bg-white border-slate-200 hover:border-slate-300'
                          : 'bg-slate-50 border-slate-100'
                      )}
                    >
                      <div className="text-sm font-semibold text-text-primary mb-2">
                        {date.getDate()}
                      </div>
                      <div className="space-y-1">
                        {dayBookings.slice(0, 3).map((booking) => (
                          <button
                            key={booking.id}
                            onClick={() => handleSelectBooking(booking)}
                            className={cn(
                              'w-full text-xs px-2 py-1 rounded-md font-medium truncate transition-shadow hover:shadow-sm border-l-2',
                              getStatusColor(booking.status)
                            )}
                          >
                            {booking.client_name}
                          </button>
                        ))}
                        {dayBookings.length > 3 && (
                          <div className="text-xs text-text-secondary px-2 py-1 font-medium">
                            +{dayBookings.length - 3} more
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
            <div className="p-6 space-y-0 overflow-x-auto">
              <div className="flex gap-0 mb-4 sticky top-0 bg-white z-20">
                <div className="w-24 flex-shrink-0 text-xs font-semibold text-text-secondary py-3 pr-4 border-r border-slate-100">時間</div>
                <div className="flex gap-0">
                  {datesForView.map((date) => (
                    <div key={date.toISOString()} className="flex-1 min-w-32 text-center px-3 py-3 border-r border-slate-100">
                      <div className="text-xs font-semibold text-text-primary">
                        {date.toLocaleDateString('zh-TW', { weekday: 'short', month: 'numeric', day: 'numeric' })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {Array.from({ length: 12 }, (_, i) => 9 + i).map((hour) => (
                <div key={hour} className="flex gap-0 items-start border-b border-slate-100 min-h-20">
                  <div className="w-24 flex-shrink-0 text-xs font-medium text-text-secondary py-3 pr-4 border-r border-slate-100 text-right">{hour}:00</div>
                  <div className="flex gap-0 flex-1">
                    {datesForView.map((date) => {
                      const hourBookings = bookings.filter((b) => {
                        const bDate = new Date(b.start_time)
                        return isDateInRange(b.start_time, date) && bDate.getHours() === hour
                      })
                      return (
                        <div key={date.toISOString()} className="flex-1 min-w-32 px-2 py-2 border-r border-slate-100 space-y-1">
                          {hourBookings.map((booking) => (
                            <button
                              key={booking.id}
                              onClick={() => handleSelectBooking(booking)}
                              className={cn(
                                'w-full text-xs px-2 py-1.5 rounded-md font-medium truncate border-l-2 cursor-pointer hover:shadow-md transition-all',
                                getStatusColor(booking.status)
                              )}
                            >
                              {booking.client_name}
                            </button>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // 日視圖：詳細時間軸
            <div className="p-6 space-y-4">
              <div className="text-2xl font-bold text-text-primary">
                {currentDate.toLocaleDateString('zh-TW', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
              <div className="space-y-3">
                {bookings
                  .filter((b) => isDateInRange(b.start_time, currentDate))
                  .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
                  .map((booking) => (
                    <button
                      key={booking.id}
                      onClick={() => handleSelectBooking(booking)}
                      className={cn(
                        'w-full text-left p-4 rounded-lg border-l-4 cursor-pointer hover:shadow-md transition-all',
                        getStatusColor(booking.status)
                      )}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-semibold text-base text-text-primary">
                            {booking.client_name}
                          </h3>
                          <p className="text-sm text-text-secondary mt-1">
                            {booking.service_name}
                          </p>
                        </div>
                        <span className={cn(
                          'text-xs font-semibold px-2 py-1 rounded-md whitespace-nowrap',
                          booking.status === 'confirmed' ? 'bg-success-light text-success' :
                          booking.status === 'pending' ? 'bg-warning-light text-warning' :
                          booking.status === 'completed' ? 'bg-info-light text-info' :
                          'bg-slate-100 text-slate-400'
                        )}>
                          {booking.status === 'confirmed' ? '已確認' :
                           booking.status === 'pending' ? '待確認' :
                           booking.status === 'completed' ? '已完成' : '已取消'}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-text-secondary">
                        <div className="flex items-center gap-2">
                          <Clock size={16} />
                          {new Date(booking.start_time).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })} - {new Date(booking.end_time).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin size={16} />
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
        <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={() => setShowDrawer(false)} />
      )}
      <div
        className={cn(
          'fixed inset-y-0 right-0 w-96 bg-white shadow-2xl transition-transform duration-300 z-50 overflow-y-auto',
          showDrawer ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-primary">預約詳情</h2>
            <button
              onClick={() => setShowDrawer(false)}
              className="p-2 hover:bg-surface-secondary rounded-lg transition text-text-secondary hover:text-text-primary"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {selectedBooking && (
          <div className="p-6 space-y-6">
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
  )
}
