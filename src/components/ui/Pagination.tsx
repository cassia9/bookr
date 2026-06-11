import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../../lib/cn'

interface Props {
  page: number
  totalPages: number
  onChange: (page: number) => void
  className?: string
}

/**
 * Pagination — 分頁導航
 */
export default function Pagination({ page, totalPages, onChange, className }: Props) {
  if (totalPages <= 1) return null
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="text-xs text-slate-400 mr-1">
        第 {page} / {totalPages} 頁
      </span>
      <button
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page === 1}
        className="w-8 h-8 flex items-center justify-center rounded-xl border border-slate-200 bg-white
          text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronLeft size={14} />
      </button>
      <button
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        className="w-8 h-8 flex items-center justify-center rounded-xl border border-slate-200 bg-white
          text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  )
}
