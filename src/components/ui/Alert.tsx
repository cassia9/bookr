import { AlertCircle, CheckCircle, AlertTriangle, Info, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export type AlertVariant = 'success' | 'error' | 'warning' | 'info'

interface Props {
  variant: AlertVariant
  title?: string
  children: ReactNode
  onClose?: () => void
  className?: string
}

const CONFIG: Record<AlertVariant, {
  icon: typeof AlertCircle
  bg: string
  border: string
  text: string
  icon_: string
}> = {
  success: { icon: CheckCircle,    bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', icon_: 'text-emerald-500' },
  error:   { icon: AlertCircle,    bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-700',     icon_: 'text-red-500'     },
  warning: { icon: AlertTriangle,  bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   icon_: 'text-amber-500'   },
  info:    { icon: Info,           bg: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-700',    icon_: 'text-blue-500'    },
}

/**
 * Alert — 提示橫幅
 * 支援 success / error / warning / info 四種樣式
 */
export default function Alert({ variant, title, children, onClose, className }: Props) {
  const cfg = CONFIG[variant]
  const Icon = cfg.icon
  return (
    <div className={cn(
      'flex gap-3 px-4 py-3 rounded-2xl border text-sm',
      cfg.bg, cfg.border, cfg.text, className,
    )}>
      <Icon size={16} className={cn('shrink-0 mt-0.5', cfg.icon_)} />
      <div className="flex-1 min-w-0">
        {title && <p className="font-semibold mb-0.5">{title}</p>}
        <div>{children}</div>
      </div>
      {onClose && (
        <button onClick={onClose} className="shrink-0 p-0.5 hover:opacity-60 transition-opacity rounded-lg">
          <X size={14} />
        </button>
      )}
    </div>
  )
}
