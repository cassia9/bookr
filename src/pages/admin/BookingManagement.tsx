import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Calendar, LayoutGrid, Plus } from 'lucide-react'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'
import CalendarPage from './CalendarPage'
import GanttPage from './GanttPage'
import NewBookingModal from '@/components/booking/NewBookingModal'
import type { Practitioner, Client, Service } from '@/types/database'

const STORE_ID = '00000000-0000-0000-0000-000000000001'

type ViewMode = 'calendar' | 'gantt'
type CalendarView = 'month' | 'week' | 'day'

export default function BookingManagement() {
  const [viewMode, setViewMode] = useState<ViewMode>('calendar')
  const [calendarView, setCalendarView] = useState<CalendarView>('week')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [showNewBooking, setShowNewBooking] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const [practitioners, setPractitioners] = useState<Practitioner[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [defaultBufferMinutes, setDefaultBufferMinutes] = useState(30)
  const [startHour, setStartHour] = useState(9)
  const [endHour, setEndHour] = useState(21)

  useEffect(() => {
    async function fetchMeta() {
      const [{ data: p }, { data: c }, { data: s }, { data: store }] = await Promise.all([
        supabase.from('practitioners').select('*').eq('store_id', STORE_ID).eq('active', true).is('deleted_at', null),
        supabase.from('clients').select('*').eq('store_id', STORE_ID).order('full_name'),
        supabase.from('services').select('*').eq('store_id', STORE_ID).eq('active', true),
        supabase.from('stores').select('open_time, close_time, default_buffer_minutes').eq('id', STORE_ID).single(),
      ])
      setPractitioners(p ?? [])
      setClients(c ?? [])
      setServices(s ?? [])
      const storeData = store as any
      setDefaultBufferMinutes(storeData?.default_buffer_minutes ?? 30)
      setStartHour(parseInt(storeData?.open_time ?? '09:00', 10))
      setEndHour(parseInt(storeData?.close_time ?? '21:00', 10))
    }
    fetchMeta()
  }, [])

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

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
    })
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* 頂部標題欄 */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 shadow-md">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-4xl font-bold text-text-primary">預約管理</h1>
            <p className="text-sm text-text-secondary mt-1">
              {viewMode === 'calendar' ? `行事曆 - ${calendarView === 'month' ? '月' : calendarView === 'week' ? '週' : '日'}視圖` : '甘特圖視圖'}
            </p>
          </div>
          <button
            onClick={() => setShowNewBooking(true)}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-black text-white rounded-xl hover:bg-gray-800 transition font-medium shadow-md hover:shadow-lg text-sm"
          >
            <Plus className="w-4 h-4" />
            新增預約
          </button>
        </div>

        {/* 第二行：視圖切換 + 日期導航 */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-100 rounded-lg p-1 gap-1">
            <button
              onClick={() => setViewMode('calendar')}
              className={cn(
                'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                viewMode === 'calendar'
                  ? 'bg-black text-white shadow-sm'
                  : 'text-text-secondary hover:text-text-primary hover:bg-slate-200'
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
                  : 'text-text-secondary hover:text-text-primary hover:bg-slate-200'
              )}
            >
              <LayoutGrid className="inline-block w-4 h-4 mr-1.5" />
              甘特圖
            </button>
          </div>

          {viewMode === 'calendar' && (
            <div className="flex items-center bg-slate-100 rounded-lg p-1 gap-1">
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

          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={handlePrevDate}
              className="p-2 hover:bg-slate-100 rounded-lg transition text-text-secondary hover:text-text-primary"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="text-center min-w-48">
              <p className="text-base font-semibold text-text-primary">
                {formatDate(currentDate)}
              </p>
            </div>
            <button
              onClick={handleNextDate}
              className="p-2 hover:bg-slate-100 rounded-lg transition text-text-secondary hover:text-text-primary"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition font-medium shadow-md text-sm ml-1"
            >
              今天
            </button>
          </div>
        </div>
      </div>

      {/* 內容區域 */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'calendar' ? (
          <CalendarPage
            key={refreshKey}
            defaultView={calendarView}
            defaultDate={currentDate}
            startHour={startHour}
            endHour={endHour}
          />
        ) : (
          <GanttPage
            key={refreshKey}
            defaultDate={currentDate}
            startHour={startHour}
            endHour={endHour}
          />
        )}
      </div>

      <NewBookingModal
        open={showNewBooking}
        onClose={() => setShowNewBooking(false)}
        onSaved={() => { setShowNewBooking(false); setRefreshKey(k => k + 1) }}
        practitioners={practitioners}
        clients={clients}
        services={services}
        onRefreshClients={async () => {
          const { data } = await supabase.from('clients').select('*').eq('store_id', STORE_ID).order('full_name')
          setClients(data ?? [])
        }}
        defaultBufferMinutes={defaultBufferMinutes}
      />
    </div>
  )
}
