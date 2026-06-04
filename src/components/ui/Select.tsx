import { useState, useRef, useEffect, useId } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '../../lib/cn'
import { shadow } from '../../lib/styles'

export interface SelectOption {
  value: string
  label: string
  /** 在選項旁顯示的色塊（從業人員顏色） */
  color?: string
}

interface Props {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  error?: boolean
  className?: string
}

export default function Select({
  value, onChange, options,
  placeholder = '請選擇', disabled, error, className,
}: Props) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const id = useId()

  const selected = options.find(o => o.value === value)

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

  // Keyboard: Escape → close
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // Scroll selected option into view when opening
  useEffect(() => {
    if (open && value && listRef.current) {
      const el = listRef.current.querySelector('[data-selected="true"]') as HTMLElement | null
      el?.scrollIntoView({ block: 'nearest' })
    }
  }, [open, value])

  function toggle() {
    if (!disabled) setOpen(v => !v)
  }

  function select(val: string) {
    onChange(val)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Trigger */}
      <button
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={toggle}
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
        {/* Label */}
        <span className={cn('flex-1 truncate', selected ? 'text-slate-800' : 'text-slate-400')}>
          {selected ? (
            <span className="flex items-center gap-2">
              {selected.color && (
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: selected.color }} />
              )}
              {selected.label}
            </span>
          ) : placeholder}
        </span>

        {/* Arrow — fixed right margin 4px */}
        <ChevronDown
          size={16}
          strokeWidth={1.5}
          style={{ marginRight: 4 }}
          className={cn(
            'flex-shrink-0 text-slate-400 transition-all duration-200',
            open ? 'rotate-180 text-indigo-500' : '',
          )}
        />
      </button>

      {/* Dropdown — renders BELOW the trigger, never overlaps */}
      {open && (
        <div
          ref={listRef}
          role="listbox"
          className={cn(
            'absolute z-50 left-0 right-0 mt-1.5',
            `bg-white rounded-2xl border border-slate-200 ${shadow.float}`,
            'overflow-y-auto max-h-52',
            // open from top-full so it always appears below
            'top-full',
          )}
        >
          {/* Placeholder row */}
          <button
            type="button"
            role="option"
            aria-selected={value === ''}
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
          {options.length > 0 && <div className="border-t border-slate-100 mx-2" />}

          {/* Options */}
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              role="option"
              data-selected={opt.value === value}
              aria-selected={opt.value === value}
              onClick={() => select(opt.value)}
              className={cn(
                'w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm transition-colors text-left',
                opt.value === value
                  ? 'bg-indigo-50 text-indigo-700 font-medium'
                  : 'text-slate-700 hover:bg-slate-50',
              )}
            >
              <span className="flex items-center gap-2 truncate">
                {opt.color && (
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: opt.color }} />
                )}
                {opt.label}
              </span>
              {opt.value === value && <Check size={14} strokeWidth={2} className="text-indigo-500 flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
