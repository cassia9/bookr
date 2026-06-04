import { useState, useRef, useEffect } from 'react'
import { Clock, Check } from 'lucide-react'
import { cn } from '../../lib/cn'
import { shadow } from '../../lib/styles'

interface Props {
  value: string              // "HH:MM" 格式，空字串表示未選
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  error?: boolean
  className?: string
  /** 起始小時（預設 8） */
  startHour?: number
  /** 結束小時（含，預設 21） */
  endHour?: number
  /** 分鐘間距（預設 15） */
  minuteStep?: number
}

function generateSlots(startHour: number, endHour: number, minuteStep: number): string[] {
  const slots: string[] = []
  for (let h = startHour; h <= endHour; h++) {
    for (let m = 0; m < 60; m += minuteStep) {
      slots.push(
        `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
      )
    }
  }
  return slots
}

export default function TimePicker({
  value, onChange,
  placeholder = '選擇時間',
  disabled, error, className,
  startHour = 8, endHour = 21, minuteStep = 15,
}: Props) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const slots = generateSlots(startHour, endHour, minuteStep)

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

  // Scroll selected into view when opening
  useEffect(() => {
    if (open && listRef.current) {
      const el = listRef.current.querySelector('[data-selected="true"]') as HTMLElement | null
      el?.scrollIntoView({ block: 'center' })
    }
  }, [open])

  function select(slot: string) {
    onChange(slot)
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
        <span className={cn('flex-1 tabular-nums', value ? 'text-slate-800' : 'text-slate-400')}>
          {value || placeholder}
        </span>
        <Clock
          size={15}
          strokeWidth={1.5}
          style={{ marginRight: 4 }}
          className={cn(
            'flex-shrink-0 transition-colors',
            open ? 'text-indigo-500' : 'text-slate-400',
          )}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          ref={listRef}
          className={cn(
            'absolute z-50 left-0 right-0 mt-1.5 top-full',
            `bg-white rounded-2xl border border-slate-200 ${shadow.float}`,
            'overflow-y-auto max-h-52',
          )}
        >
          {/* Placeholder row */}
          <button
            type="button"
            onClick={() => select('')}
            className={cn(
              'w-full flex items-center justify-between px-3 py-2.5 text-sm transition-colors text-left',
              value === ''
                ? 'bg-indigo-50 text-indigo-700 font-medium'
                : 'text-slate-400 hover:bg-slate-50',
            )}
          >
            <span>{placeholder}</span>
            {value === '' && <Check size={14} strokeWidth={2} className="text-indigo-500" />}
          </button>

          {/* Divider */}
          <div className="border-t border-slate-100 mx-2" />

          {/* Time slots */}
          {slots.map(slot => (
            <button
              key={slot}
              type="button"
              data-selected={slot === value}
              onClick={() => select(slot)}
              className={cn(
                'w-full flex items-center justify-between px-3 py-2 text-sm transition-colors text-left tabular-nums',
                slot === value
                  ? 'bg-indigo-50 text-indigo-700 font-medium'
                  : 'text-slate-700 hover:bg-slate-50',
              )}
            >
              <span>{slot}</span>
              {slot === value && <Check size={14} strokeWidth={2} className="text-indigo-500 flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
