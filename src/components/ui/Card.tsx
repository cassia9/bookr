import { cn } from '../../lib/cn'
import { shadow } from '../../lib/styles'
import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  /** 加 hover 提升效果 */
  hoverable?: boolean
  /** 點擊事件 */
  onClick?: () => void
}

export function Card({ children, className, hoverable, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        `bg-white rounded-3xl border border-slate-100 ${shadow.card}`,
        hoverable && 'cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all',
        onClick && 'cursor-pointer',
        className,
      )}
    >
      {children}
    </div>
  )
}

interface CardHeaderProps {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}

export function CardHeader({ title, description, action, className }: CardHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between px-5 py-4 border-b border-slate-100', className)}>
      <div>
        <div className="text-sm font-semibold text-slate-800">{title}</div>
        {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}

interface CardBodyProps {
  children: ReactNode
  className?: string
}

export function CardBody({ children, className }: CardBodyProps) {
  return <div className={cn('px-5 py-4', className)}>{children}</div>
}
