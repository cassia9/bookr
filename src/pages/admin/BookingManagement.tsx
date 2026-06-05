import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Calendar, LayoutGrid, Plus, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import CalendarPage from './CalendarPage'
import GanttPage from './GanttPage'

interface Practitioner {
  id: string
  name: string
  bookingCount?: number
  status?: 'available' | 'busy' | 'no_bookings'
}

type ViewMode = 'calendar' | 'gantt'
type CalendarView = 'month' | 'week' | 'day'

export default function BookingManagement() {
  const [viewMode, setViewMode] = useState<ViewMode>('calendar')
  const [calendarView, setCalendarView] = useState<CalendarView>('week')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [practitioners, setPractitioners] = useState<Practitioner[]>([])
  const [isLoadingPractitioners, setIsLoadingPractitioners] = useState(true)
  const [selectedPractitionerId, setSelectedPractitionerId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [showAddPractitionerModal, setShowAddPractitionerModal] = useState(false)

  // 載入從業人員
  useEffect(() => {
    loadPractitioners()
  }, [currentDate])

  const loadPractitioners = async () => {
    setIsLoadingPractitioners(true)
    try {
      const { data, error } = await supabase
        .from('practitioners')
        .select('id, name')
        .is('deleted_at', null)
        .order('name', { ascending: true })

      if (error) throw error

      // 計算每位從業人員的預約狀況
      const practitionersWithStatus = await Promise.all(
        (data || []).map(async (practitioner) => {
          // 計算今日預約數
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          const tomorrow = new Date(today)
          tomorrow.setDate(tomorrow.getDate() + 1)

          const { count } = await supabase
            .from('bookings')
            .select('id', { count: 'exact', head: 0 })
            .eq('practitioner_id', practitioner.id)
            .gte('booking_time', today.toISOString())
            .lt('booking_time', tomorrow.toISOString())
            .in('status', ['pending', 'confirmed'])

          const bookingCount = count || 0
          let status: Practitioner['status'] = 'no_bookings'
          if (bookingCount > 0) {
            status = bookingCount >= 2 ? 'busy' : 'available'
          }

          return {
            ...practitioner,
            bookingCount,
            status,
          }
        })
      )

      setPractitioners(practitionersWithStatus)
    } catch (error) {
      console.error('Failed to load practitioners:', error)
    } finally {
      setIsLoadingPractitioners(false)
    }
  }

  const handlePrevDate = () => {
    const newDate = new Date(currentDate)
    if (calendarView === 'month') {
      newDate.setMonth(newDate.getMonth() - 1)
    } else if (calendarView === 'week') {
      newDate.setDate(newDate.getDate() - 7)
    } else {
      newDate.setDate(newDate.getDate() - 1)
    }
    setCurrentDate(newDate)
  }

  const handleNextDate = () => {
    const newDate = new Date(currentDate)
    if (calendarView === 'month') {
      newDate.setMonth(newDate.getMonth() + 1)
    } else if (calendarView === 'week') {
      newDate.setDate(newDate.getDate() + 7)
    } else {
      newDate.setDate(newDate.getDate() + 1)
    }
    setCurrentDate(newDate)
  }

  const handleToday = () => {
    setCurrentDate(new Date())
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
    })
  }

  const filteredPractitioners = practitioners.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // 獲取狀態指示顏色
  const getStatusIndicator = (status?: Practitioner['status']) => {
    switch (status) {
      case 'busy':
        return 'bg-red-400'
      case 'available':
        return 'bg-yellow-400'
      case 'no_bookings':
        return 'bg-gray-300'
      default:
        return 'bg-gray-300'
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* 頂部標題欄 */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">預約管理</h1>
            <p className="text-sm text-slate-600 mt-1">
              {viewMode === 'calendar' ? `行事曆 - ${calendarView === 'month' ? '月' : calendarView === 'week' ? '週' : '日'}視圖` : '甘特圖視圖'}
            </p>
          </div>

          {/* 日期導航 */}
          <div className="flex items-center gap-4">
            <button
              onClick={handlePrevDate}
              className="p-2 hover:bg-slate-100 rounded-lg transition"
              title="上一個"
            >
              <ChevronLeft className="w-5 h-5 text-slate-600" />
            </button>

            <div className="text-center min-w-48">
              <p className="text-lg font-semibold text-slate-900">
                {formatDate(currentDate)}
              </p>
            </div>

            <button
              onClick={handleNextDate}
              className="p-2 hover:bg-slate-100 rounded-lg transition"
              title="下一個"
            >
              <ChevronRight className="w-5 h-5 text-slate-600" />
            </button>

            <button
              onClick={handleToday}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium"
            >
              今天
            </button>
          </div>
        </div>
      </div>

      {/* 主容器 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左側面板：從業人員管理 */}
        <aside className="w-60 bg-white border-r border-slate-200 flex flex-col overflow-hidden">
          {/* 面板標題 */}
          <div className="px-4 py-4 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">從業人員</h2>

            {/* 搜尋框 */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="搜尋..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* 從業人員列表 */}
          <div className="flex-1 overflow-y-auto">
            {isLoadingPractitioners ? (
              <div className="px-4 py-6 text-center text-slate-500 text-sm">
                加載中...
              </div>
            ) : filteredPractitioners.length === 0 ? (
              <div className="px-4 py-6 text-center text-slate-500 text-sm">
                暫無從業人員
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {filteredPractitioners.map(practitioner => (
                  <button
                    key={practitioner.id}
                    onClick={() => setSelectedPractitionerId(
                      selectedPractitionerId === practitioner.id ? null : practitioner.id
                    )}
                    className={cn(
                      'w-full text-left px-4 py-3 transition-colors',
                      selectedPractitionerId === practitioner.id
                        ? 'bg-indigo-50 border-l-4 border-indigo-600'
                        : 'hover:bg-slate-50'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      {/* 狀態指示 */}
                      <div className={cn(
                        'w-3 h-3 rounded-full flex-shrink-0',
                        getStatusIndicator(practitioner.status)
                      )} />

                      {/* 名字和預約數 */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {practitioner.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {practitioner.bookingCount || 0} 場預約
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 新增按鈕 */}
          <div className="px-4 py-4 border-t border-slate-200">
            <button
              onClick={() => setShowAddPractitionerModal(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition font-medium text-sm"
            >
              <Plus className="w-4 h-4" />
              新增老師
            </button>
          </div>
        </aside>

        {/* 右側主視圖 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 視圖切換 */}
          <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-2">
            <div className="flex items-center bg-slate-100 rounded-lg p-1 gap-1">
              <button
                onClick={() => setViewMode('calendar')}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                  viewMode === 'calendar'
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                )}
              >
                <Calendar className="inline-block w-4 h-4 mr-1.5" />
                行事曆
              </button>
              <button
                onClick={() => setViewMode('gantt')}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                  viewMode === 'gantt'
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                )}
              >
                <LayoutGrid className="inline-block w-4 h-4 mr-1.5" />
                甘特圖
              </button>
            </div>

            {/* 行事曆視圖模式切換（僅在行事曆模式顯示） */}
            {viewMode === 'calendar' && (
              <div className="ml-auto flex items-center bg-slate-100 rounded-lg p-1 gap-1">
                {(['month', 'week', 'day'] as CalendarView[]).map(view => (
                  <button
                    key={view}
                    onClick={() => setCalendarView(view)}
                    className={cn(
                      'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                      calendarView === view
                        ? 'bg-white text-indigo-700 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    )}
                  >
                    {view === 'month' ? '月' : view === 'week' ? '週' : '日'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 內容區域 */}
          <div className="flex-1 overflow-hidden">
            {viewMode === 'calendar' ? (
              <CalendarPage
                key={`calendar-${selectedPractitionerId}`}
                selectedPractitionerId={selectedPractitionerId}
                defaultView={calendarView}
                defaultDate={currentDate}
              />
            ) : (
              <GanttPage
                key={`gantt-${selectedPractitionerId}`}
                selectedPractitionerId={selectedPractitionerId}
                defaultDate={currentDate}
              />
            )}
          </div>
        </div>
      </div>

      {/* 新增從業人員 Modal */}
      {showAddPractitionerModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">新增從業人員</h2>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  姓名 *
                </label>
                <input
                  type="text"
                  placeholder="請輸入從業人員名字"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  電話
                </label>
                <input
                  type="tel"
                  placeholder="(可選)"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowAddPractitionerModal(false)}
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition font-medium"
              >
                取消
              </button>
              <button
                onClick={() => {
                  // TODO: 實作新增從業人員邏輯
                  setShowAddPractitionerModal(false)
                }}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium"
              >
                新增
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
