import { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface FormFieldProps {
  /** 標籤文本 */
  label: string
  /** 錯誤訊息 */
  error?: string
  /** 是否為必填 */
  required?: boolean
  /** 提示文本 */
  hint?: string
  /** 是否禁用 */
  disabled?: boolean
  /** 子元素（通常是 Input、Select 等） */
  children: ReactNode
  /** 額外的 CSS 類名 */
  className?: string
}

/**
 * FormField - 表單字段容器
 *
 * 包裝標籤、輸入框、錯誤提示、提示文本
 *
 * @example
 * ```tsx
 * <FormField label="郵箱" required error={errors.email}>
 *   <Input type="email" value={email} onChange={...} />
 * </FormField>
 * ```
 */
export default function FormField({
  label,
  error,
  required = false,
  hint,
  disabled = false,
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {/* 標籤 */}
      <label
        className={cn(
          'block text-sm font-medium',
          disabled ? 'text-slate-400' : 'text-slate-900'
        )}
      >
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>

      {/* 輸入框或其他控件 */}
      <div className={disabled ? 'opacity-50 cursor-not-allowed' : ''}>
        {children}
      </div>

      {/* 提示或錯誤文本 */}
      {error && (
        <p className="text-sm text-red-600 mt-1">{error}</p>
      )}
      {hint && !error && (
        <p className="text-xs text-slate-500 mt-1">{hint}</p>
      )}
    </div>
  )
}
