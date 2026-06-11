import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface Props {
  label: string
  /** 必填星號 */
  required?: boolean
  /** 灰色提示文字（label 下方） */
  hint?: string
  /** 錯誤訊息（紅色，顯示於底部） */
  error?: string
  disabled?: boolean
  children: ReactNode
  className?: string
}

/**
 * FormField — 表單欄位容器
 * 包含：label、hint、input slot、error message
 */
export default function FormField({
  label, required, hint, error, disabled, children, className,
}: Props) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label className={cn(
        'block text-xs font-medium',
        disabled ? 'text-slate-400' : 'text-slate-500',
      )}>
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
        {hint && <span className="ml-1.5 font-normal text-slate-400">{hint}</span>}
      </label>
      <div className={disabled ? 'opacity-50 pointer-events-none' : ''}>
        {children}
      </div>
      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}
    </div>
  )
}
