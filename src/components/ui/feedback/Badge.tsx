import { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info'

export interface BadgeProps {
  /** 標籤變體 */
  variant?: BadgeVariant
  /** 標籤內容 */
  children: ReactNode
  /** 額外的 CSS 類名 */
  className?: string
}

const variantClasses = {
  default: 'bg-slate-100 text-slate-700 border border-slate-200',
  success: 'bg-green-100 text-green-700 border border-green-200',
  warning: 'bg-amber-100 text-amber-700 border border-amber-200',
  error: 'bg-red-100 text-red-700 border border-red-200',
  info: 'bg-blue-100 text-blue-700 border border-blue-200',
}

/**
 * Badge - 標籤/徽章組件
 *
 * @example
 * ```tsx
 * <Badge variant="success">已確認</Badge>
 * <Badge variant="error">已取消</Badge>
 * ```
 */
export default function Badge({
  variant = 'default',
  children,
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1',
        'px-2.5 py-1 rounded-md',
        'text-xs font-medium',
        variantClasses[variant],
        className
      )}
    >
      {children}
    </span>
  )
}
