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
        variant === 'primary' && 'bg-black text-white hover:bg-primary-hover shadow-md shadow-black/10 hover:shadow-lg hover:shadow-black/15',
        variant === 'secondary' && 'bg-surface-secondary text-text-primary hover:bg-border border border-border shadow-sm',
        variant === 'danger' && 'bg-danger text-white hover:bg-danger/90 shadow-md shadow-danger/20',
        variant === 'ghost' && 'text-text-secondary hover:bg-surface-secondary',
        className,
      )}
      {...props}
    >
      {loading && <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />}
      {children}
    </button>
  )
}
