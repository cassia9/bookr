import type { ReactNode, ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
type Size = 'sm' | 'md'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  children: ReactNode
}

export default function Button({
  variant = 'primary', size = 'md', loading, children, className, disabled, ...props
}: Props) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium rounded-2xl transition-all active:scale-95',
        'disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100',
        size === 'sm' && 'px-3 py-1.5 text-xs',
        size === 'md' && 'px-4 py-2.5 text-sm',
        variant === 'primary' && 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-200 hover:shadow-lg hover:shadow-indigo-200',
        variant === 'secondary' && 'bg-slate-100 text-slate-700 hover:bg-slate-200 shadow-sm',
        variant === 'danger' && 'bg-red-500 text-white hover:bg-red-600 shadow-md shadow-red-200',
        variant === 'ghost' && 'text-slate-600 hover:bg-slate-100',
        className,
      )}
      {...props}
    >
      {loading && <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />}
      {children}
    </button>
  )
}
