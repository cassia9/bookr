import { useState, useRef, useEffect } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../../lib/cn'
import { shadow } from '../../lib/styles'

interface Props {
  value: string        // 'yyyy-MM-dd' 格式，空字串表示未選
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  error?: boolean
  className?: string
}

const WEEK_DAYS = ['一', '二', '三', '四', '五', '六', '日']
const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function todayStr(): string {
  const t = new Date()
  return toDateStr(t.getFullYear(), t.getMonth(), t.getDate())
}

function formatDisplay(value: string): string {
  if (!value) return ''
  const [y, m, d] = value.split('-').map(Number)
  return `${y}年${m}月${d}日`
}

export default function DatePicker({
  value, onChange,
  placeholder = '選擇日期',
  disabled, error, className,
}: Props) {
  const today = todayStr()

  // Init view to value's month, or current month
  const initView = () => {
    if (value) {
      const [y, m] = value.split('-').map(Number)
      return { y, m: m - 1 }
    }
    const t = new Date()
    return { y: t.getFullYear(), m: t.getMonth() }
  }

  const [open, setOpen] = useState(false)
  const [view, setView] = useState(initView)
  const containerRef = useRef<HTMLDivElement>(null)

  // Sync view when value changes externally
  useEffect(() => {
    if (value) {
      const [y, m] = value.split('-').map(Number)
      setView({ y, m: m - 1 })
    }
  }, [value])

  // Click outside → close
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  // Escape → close
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  function prevMonth() {
    setView(v =>
      v.m === 0
        ? { y: v.y - 1, m: 11 }
        : { y: v.y, m: v.m - 1 },
    )
  }

  function nextMonth() {
    setView(v =>
      v.m === 11
        ? { y: v.y + 1, m: 0 }
        : { y: v.y, m: v.m + 1 },
    )
  }

  // Build calendar cells (always 6 rows × 7 = 42)
  const firstDow = (new Date(view.y, view.m, 1).getDay() + 6) % 7 // Mon=0
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate()
  const daysInPrev = new Date(view.y, view.m, 0).getDate()

  const cells: { dateStr: string; day: number; current: boolean }[] = []

  // Trailing days from previous month
  for (let i = firstDow - 1; i >= 0; i--) {
    const d = daysInPrev - i
    const pm = view.m === 0 ? 11 : view.m - 1
    const py = view.m === 0 ? view.y - 1 : view.y
    cells.push({ dateStr: toDateStr(py, pm, d), day: d, current: false })
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ dateStr: toDateStr(view.y, view.m, d), day: d, current: true })
  }

  // Leading days from next month
  const remaining = 42 - cells.length
  for (let d = 1; d <= remaining; d++) {
    const nm = view.m === 11 ? 0 : view.m + 1
    const ny = view.m === 11 ? view.y + 1 : view.y
    cells.push({ dateStr: toDateStr(ny, nm, d), day: d, current: false })
  }

  function selectDate(dateStr: string) {
    onChange(dateStr)
    setOpen(false)
  }

  function goToday() {
    selectDate(today)
  }

  function clear() {
    onChange('')
    setOpen(false)
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(v => !v)}
        className={cn(
          'w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-2xl border text-sm text-left transition-all',
          'bg-slate-50 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed',
          open
            ? 'border-indigo-400 ring-2 ring-indigo-100 bg-white'
            : error
            ? 'border-red-400 ring-2 ring-red-100 bg-white'
            : 'border-slate-200 hover:border-slate-300',
        )}
      >
        <span className={cn('flex-1', value ? 'text-slate-800' : 'text-slate-400')}>
          {value ? formatDisplay(value) : placeholder}
        </span>
        <CalendarDays
          size={15}
          strokeWidth={1.5}
          style={{ marginRight: 4 }}
          className={cn('flex-shrink-0 transition-colors', open ? 'text-indigo-500' : 'text-slate-400')}
        />
      </button>

      {/* Calendar panel */}
      {open && (
        <div className={`absolute z-50 left-0 mt-1.5 top-full bg-white rounded-3xl border border-slate-200 ${shadow.float} p-3 w-64`}>
          {/* Month nav */}
          <div className="flex items-center justify-between mb-3 px-1">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1.5 rounded-xl hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-800"
            >
              <ChevronLeft size={14} strokeWidth={2.5} />
            </button>
            <span className="text-sm font-semibold text-slate-800 select-none">
              {view.y}年{MONTHS[view.m]}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="p-1.5 rounded-xl hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-800"
            >
              <ChevronRight size={14} strokeWidth={2.5} />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 mb-1">
            {WEEK_DAYS.map(d => (
              <div key={d} className="text-center text-[11px] font-medium text-slate-400 py-1 select-none">
                {d}
              </div>
            ))}
          </div>

          {/* Date grid */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((cell, i) => {
              const isSelected = cell.dateStr === value
              const isToday = cell.dateStr === today
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => selectDate(cell.dateStr)}
                  className={cn(
                    'h-8 w-full rounded-xl text-xs font-medium transition-all select-none',
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                      : isToday && !isSelected
                      ? 'bg-indigo-50 text-indigo-600 font-semibold'
                      : cell.current
                      ? 'text-slate-700 hover:bg-slate-100'
                      : 'text-slate-300 hover:bg-slate-50',
                  )}
                >
                  {cell.day}
                </button>
              )
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100">
            <button
              type="button"
              onClick={clear}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors px-1 py-0.5 rounded"
            >
              清除
            </button>
            <button
              type="button"
              onClick={goToday}
              className="text-xs text-indigo-500 hover:text-indigo-700 font-medium transition-colors px-1 py-0.5 rounded"
            >
              今天
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
