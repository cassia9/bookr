import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Calendar, LayoutGrid } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import CalendarPage from './CalendarPage'
import GanttPage from './GanttPage'
import PractitionerList from '@/components/practitioners/PractitionerList'
import PractitionerForm from '@/components/practitioners/PractitionerForm'
import PractitionerLeaveManager from '@/components/practitioners/PractitionerLeaveManager'

interface Practitioner {
  id: string
  name: string
  color_hex: string
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
  const [showPractitionerForm, setShowPractitionerForm] = useState(false)
  const [editingPractitionerId, setEditingPractitionerId] = useState<string | null>(null)
  const [showLeaveManager, setShowLeaveManager] = useState(false)
  const [leaveManagerPractitionerId, setLeaveManagerPractitionerId] = useState<string | null>(null)

  // 載入從業人員
  useEffect(() => {
    loadPractitioners()
  }, [currentDate])

  const loadPractitioners = async () => {
    setIsLoadingPractitioners(true)
    try {
      const { data, error } = await supabase
        .from('practitioners')
        .select('id, name, color_hex')
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


  const handleAddPractitioner = () => {
    setEditingPractitionerId(null)
    setShowPractitionerForm(true)
  }

  const handleEditPractitioner = (id: string) => {
    setEditingPractitionerId(id)
    setShowPractitionerForm(true)
  }

  const handleManageLeaves = (id: string) => {
    setLeaveManagerPractitionerId(id)
    setShowLeaveManager(true)
  }

  const handleFormSuccess = () => {
    setShowPractitionerForm(false)
    setEditingPractitionerId(null)
    loadPractitioners()
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* 頂部標題欄 */}
      <div className="bg-white border-b border-slate-200 px-6 py-6 shadow-md">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-text-primary">預約管理</h1>
            <p className="text-sm text-text-secondary mt-1">
              {viewMode === 'calendar' ? `行事曆 - ${calendarView === 'month' ? '月' : calendarView === 'week' ? '週' : '日'}視圖` : '甘特圖視圖'}
            </p>
          </div>

          {/* 日期導航 */}
          <div className="flex items-center gap-4">
            <button
              onClick={handlePrevDate}
              className="p-2 hover:bg-surface-secondary rounded-lg transition text-text-secondary hover:text-text-primary"
              title="上一個"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="text-center min-w-48">
              <p className="text-lg font-semibold text-text-primary">
                {formatDate(currentDate)}
              </p>
            </div>

            <button
              onClick={handleNextDate}
              className="p-2 hover:bg-surface-secondary rounded-lg transition text-text-secondary hover:text-text-primary"
              title="下一個"
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            <button
              onClick={handleToday}
              className="px-4 py-2 bg-black text-white rounded-lg hover:bg-primary-hover transition font-medium shadow-md hover:shadow-lg"
            >
              今天
            </button>
          </div>
        </div>
      </div>

      {/* 主容器 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左側面板：從業人員管理 */}
        <PractitionerList
          selectedPractitionerId={selectedPractitionerId}
          onSelectPractitioner={setSelectedPractitionerId}
          onAddPractitioner={handleAddPractitioner}
          onEditPractitioner={handleEditPractitioner}
          onDeletePractitioner={() => {
            loadPractitioners()
          }}
          onManageLeaves={handleManageLeaves}
        />

        {/* 右側主視圖 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 視圖切換 */}
          <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-2 shadow-sm">
            <div className="flex items-center bg-surface-secondary rounded-lg p-1 gap-1">
              <button
                onClick={() => setViewMode('calendar')}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                  viewMode === 'calendar'
                    ? 'bg-black text-white shadow-sm'
                    : 'text-text-secondary hover:text-text-primary hover:bg-slate-100'
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
                    ? 'bg-black text-white shadow-sm'
                    : 'text-text-secondary hover:text-text-primary hover:bg-slate-100'
                )}
              >
                <LayoutGrid className="inline-block w-4 h-4 mr-1.5" />
                甘特圖
              </button>
            </div>

            {/* 行事曆視圖模式切換（僅在行事曆模式顯示） */}
            {viewMode === 'calendar' && (
              <div className="ml-auto flex items-center bg-surface-secondary rounded-lg p-1 gap-1">
                {(['month', 'week', 'day'] as CalendarView[]).map(view => (
                  <button
                    key={view}
                    onClick={() => setCalendarView(view)}
                    className={cn(
                      'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                      calendarView === view
                        ? 'bg-black text-white shadow-sm'
                        : 'text-text-secondary hover:text-text-primary hover:bg-white'
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

      {/* 新增/編輯從業人員 Form */}
      {showPractitionerForm && (
        <PractitionerForm
          practitionerId={editingPractitionerId || undefined}
          onSuccess={handleFormSuccess}
          onCancel={() => {
            setShowPractitionerForm(false)
            setEditingPractitionerId(null)
          }}
        />
      )}

      {/* 休假管理 Modal */}
      {showLeaveManager && leaveManagerPractitionerId && (
        <PractitionerLeaveManager
          practitionerId={leaveManagerPractitionerId}
          practitionerName={
            practitioners.find((p) => p.id === leaveManagerPractitionerId)
              ?.name || ''
          }
          onClose={() => {
            setShowLeaveManager(false)
            setLeaveManagerPractitionerId(null)
          }}
        />
      )}
    </div>
  )
}
