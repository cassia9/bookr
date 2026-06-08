import { forwardRef, InputHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** 輸入框左側前綴（通常是圖標） */
  prefix?: ReactNode
  /** 輸入框右側後綴（通常是圖標） */
  suffix?: ReactNode
  /** 是否有錯誤 */
  error?: boolean
}

/**
 * Input - 文本輸入框
 *
 * @example
 * ```tsx
 * <Input
 *   type="text"
 *   placeholder="輸入名字"
 *   value={value}
 *   onChange={(e) => setValue(e.target.value)}
 * />
 * ```
 */
const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    { className, prefix, suffix, error = false, disabled, ...props },
    ref
  ) => {
    const baseClasses = cn(
      'w-full px-4 py-2.5',
      'border rounded-lg',
      'text-slate-900 placeholder-slate-400',
      'transition-all duration-200',
      'focus:outline-none focus:ring-2 focus:ring-offset-2',
      'disabled:opacity-50 disabled:cursor-not-allowed'
    )

    const borderClasses = error
      ? 'border-red-500 focus:ring-red-300'
      : 'border-slate-200 focus:ring-black'

    const containerClasses = cn(
      'relative flex items-center',
      prefix || suffix ? 'gap-1' : ''
    )

    return (
      <div className={containerClasses}>
        {prefix && (
          <div className="absolute left-3 pointer-events-none text-slate-400">
            {prefix}
          </div>
        )}

        <input
          ref={ref}
          disabled={disabled}
          className={cn(
            baseClasses,
            borderClasses,
            prefix ? 'pl-10' : '',
            suffix ? 'pr-10' : '',
            className
          )}
          {...props}
        />

        {suffix && (
          <div className="absolute right-3 pointer-events-none text-slate-400">
            {suffix}
          </div>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'

export default Input
