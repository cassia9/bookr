import { Search, X } from 'lucide-react'
import { cn } from '../../lib/cn'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

/**
 * SearchInput — 帶搜尋圖示的輸入框，有清除按鈕
 */
export default function SearchInput({ value, onChange, placeholder = '搜尋…', className }: Props) {
  return (
    <div className={cn('relative flex items-center', className)}>
      <Search size={15} className="absolute left-3 text-slate-400 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 pl-9 pr-8 text-sm bg-white border border-slate-200 rounded-2xl
          text-slate-900 placeholder:text-slate-300
          focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-shadow"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2.5 p-0.5 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
          type="button"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}
