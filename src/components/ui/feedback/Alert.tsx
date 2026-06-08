import { AlertCircle, CheckCircle, AlertTriangle, Info, X } from 'lucide-react'
import { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type AlertType = 'success' | 'error' | 'warning' | 'info'

export interface AlertProps {
  /** 警告類型 */
  type: AlertType
  /** 標題（可選） */
  title?: string
  /** 警告訊息 */
  message: string | ReactNode
  /** 操作按鈕（可選） */
  action?: {
    label: string
    onClick: () => void
  }
  /** 關閉回調 */
  onClose?: () => void
  /** 是否可關閉 */
  closable?: boolean
}

const alertConfig = {
  success: {
    icon: CheckCircle,
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    textColor: 'text-green-900',
    titleColor: 'text-green-900',
    iconColor: 'text-green-600',
  },
  error: {
    icon: AlertCircle,
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    textColor: 'text-red-700',
    titleColor: 'text-red-900',
    iconColor: 'text-red-600',
  },
  warning: {
    icon: AlertTriangle,
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    textColor: 'text-amber-700',
    titleColor: 'text-amber-900',
    iconColor: 'text-amber-600',
  },
  info: {
    icon: Info,
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    textColor: 'text-blue-700',
    titleColor: 'text-blue-900',
    iconColor: 'text-blue-600',
  },
}

/**
 * Alert - 警告提示組件
 *
 * @example
 * ```tsx
 * <Alert
 *   type="error"
 *   title="出錯了"
 *   message="老師名字不能為空"
 *   onClose={() => setError(null)}
 * />
 * ```
 */
export default function Alert({
  type,
  title,
  message,
  action,
  onClose,
  closable = true,
}: AlertProps) {
  const config = alertConfig[type]
  const Icon = config.icon

  return (
    <div
      className={cn(
        'flex gap-4 p-4 rounded-lg border',
        'animate-in fade-in slide-in-from-top-2',
        config.bgColor,
        config.borderColor
      )}
    >
      {/* 圖標 */}
      <Icon className={cn('w-5 h-5 flex-shrink-0 mt-0.5', config.iconColor)} />

      {/* 內容 */}
      <div className="flex-1 min-w-0">
        {title && (
          <p className={cn('font-medium mb-1', config.titleColor)}>
            {title}
          </p>
        )}
        <p className={cn('text-sm', config.textColor)}>
          {message}
        </p>

        {/* 操作按鈕 */}
        {action && (
          <button
            onClick={action.onClick}
            className={cn(
              'mt-3 text-sm font-medium',
              'hover:underline transition-colors'
            )}
          >
            {action.label}
          </button>
        )}
      </div>

      {/* 關閉按鈕 */}
      {closable && onClose && (
        <button
          onClick={onClose}
          className={cn(
            'flex-shrink-0 p-1 rounded hover:opacity-70 transition-opacity',
            config.textColor
          )}
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
