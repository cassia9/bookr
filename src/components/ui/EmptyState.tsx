import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface Props {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export default function EmptyState({ icon, title, description, action, className }: Props) {
  return (
    <div className={cn(
      'bg-white rounded-3xl border border-slate-100 shadow-sm p-12 text-center',
      className,
    )}>
      <div className="flex justify-center mb-3 text-slate-200">{icon}</div>
      <p className="text-slate-600 font-medium">{title}</p>
      {description && <p className="text-sm text-slate-400 mt-1">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}
