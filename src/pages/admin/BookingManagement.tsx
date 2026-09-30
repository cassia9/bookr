import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Calendar, LayoutGrid, Plus } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'
import CalendarPage from './CalendarPage'
import GanttPage from './GanttPage'
import NewBookingModal, { nearestSlot } from '@/components/booking/NewBookingModal'
import type { Practitioner, Client, Service } from '@/types/database'

const STORE_ID = '00000000-0000-0000-0000-000000000001'

type ViewMode = 'calendar' | 'gantt'
type CalendarView = 'month' | 'week' | 'day'

export default function BookingManagement() {
  const [viewMode, setViewMode] = useState<ViewMode>('calendar')
  const [calendarView, setCalendarView] = useState<CalendarView>(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches
      ? 'day'
      : 'week'
  ))
  const [currentDate, setCurrentDate] = useState(new Date())
  const [showNewBooking, setShowNewBooking] = useState(false)
  const [newBookingDate, setNewBookingDate] = useState<string | undefined>()
  const [newBookingTime, setNewBookingTime] = useState<string | undefined>()
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
      const storeData = store as {
        default_buffer_minutes?: number
        open_time?: string
        close_time?: string
      } | null
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

  const formatCompactDate = (date: Date) => date.toLocaleDateString('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  })

  function openNewBooking(date = new Date(), time?: string) {
    setNewBookingDate(format(date, 'yyyy-MM-dd'))
    setNewBookingTime(time ?? nearestSlot())
    setShowNewBooking(true)
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50">
      {/* 頂部標題欄 */}
      <div className="border-b border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-6">
        <div className="mb-4 flex items-start justify-between gap-3 sm:items-center">
          <div className="min-w-0">
            <h1 className="text-2xl font-black tracking-tight text-text-primary sm:text-4xl">預約管理</h1>
            <p className="text-sm text-text-secondary mt-1">
              {viewMode === 'calendar' ? `行事曆 - ${calendarView === 'month' ? '月' : calendarView === 'week' ? '週' : '日'}視圖` : '甘特圖視圖'}
            </p>
          </div>
          <button
            onClick={() => openNewBooking()}
            className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-2xl bg-black px-3.5 py-2.5 text-sm font-medium text-white shadow-md transition active:scale-95 sm:px-5 sm:hover:bg-gray-800 sm:hover:shadow-lg"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">新增預約</span>
            <span className="sm:hidden">新增</span>
          </button>
        </div>

        {/* 第二行：視圖切換 + 日期導航 */}
        <div className="grid gap-3 sm:flex sm:items-center">
          <div className="grid grid-cols-2 items-center gap-1 rounded-xl bg-slate-100 p-1 sm:flex sm:rounded-lg">
            <button
              onClick={() => setViewMode('calendar')}
              className={cn(
                'min-h-9 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors sm:rounded-md',
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
                'min-h-9 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors sm:rounded-md',
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
            <div className="grid grid-cols-3 items-center gap-1 rounded-xl bg-slate-100 p-1 sm:flex sm:rounded-lg">
              {(['month', 'week', 'day'] as CalendarView[]).map(view => (
                <button
                  key={view}
                  onClick={() => setCalendarView(view)}
                  className={cn(
                    'min-h-9 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors sm:rounded-md',
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

          <div className="flex min-w-0 items-center gap-1 sm:ml-auto">
            <button
              onClick={handlePrevDate}
              aria-label="上一個日期區間"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-text-secondary transition active:bg-slate-100 sm:hover:bg-slate-100 sm:hover:text-text-primary"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0 flex-1 text-center sm:min-w-48 sm:flex-none">
              <p className="hidden text-base font-semibold text-text-primary sm:block">
                {formatDate(currentDate)}
              </p>
              <p className="truncate text-sm font-bold text-text-primary sm:hidden">
                {formatCompactDate(currentDate)}
              </p>
            </div>
            <button
              onClick={handleNextDate}
              aria-label="下一個日期區間"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-text-secondary transition active:bg-slate-100 sm:hover:bg-slate-100 sm:hover:text-text-primary"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="ml-1 min-h-10 shrink-0 rounded-xl bg-black px-3 py-2 text-sm font-medium text-white shadow-md transition active:scale-95 sm:px-4 sm:hover:bg-gray-800"
            >
              今天
            </button>
          </div>
        </div>
      </div>

      {/* 內容區域 */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {viewMode === 'calendar' ? (
          <CalendarPage
            key={refreshKey}
            defaultView={calendarView}
            defaultDate={currentDate}
            startHour={startHour}
            endHour={endHour}
            onNewBooking={openNewBooking}
            onCalendarViewChange={setCalendarView}
            onCalendarDateChange={setCurrentDate}
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
        initialDate={newBookingDate}
        initialTime={newBookingTime}
      />
    </div>
  )
}
