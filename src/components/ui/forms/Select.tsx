import { forwardRef, SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface SelectOption {
  value: string | number
  label: string
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** 選項列表 */
  options: SelectOption[]
  /** 是否有錯誤 */
  error?: boolean
  /** 佔位符文本（非選項） */
  placeholder?: string
}

/**
 * Select - 下拉選擇框
 *
 * @example
 * ```tsx
 * <Select
 *   options={[
 *     { value: 'active', label: '活躍' },
 *     { value: 'inactive', label: '停用' }
 *   ]}
 *   value={status}
 *   onChange={(e) => setStatus(e.target.value)}
 * />
 * ```
 */
const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className,
      options,
      error = false,
      placeholder,
      disabled,
      ...props
    },
    ref
  ) => {
    const baseClasses = cn(
      'w-full px-4 py-2.5 pr-10',
      'border rounded-lg',
      'text-slate-900 bg-white',
      'transition-all duration-200',
      'focus:outline-none focus:ring-2 focus:ring-offset-2',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      'appearance-none cursor-pointer'
    )

    const borderClasses = error
      ? 'border-red-500 focus:ring-red-300'
      : 'border-slate-200 focus:ring-black'

    return (
      <div className="relative">
        <select
          ref={ref}
          disabled={disabled}
          className={cn(
            baseClasses,
            borderClasses,
            className
          )}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {/* 下拉指示符 */}
        <ChevronDown
          className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
          strokeWidth={2}
        />
      </div>
    )
  }
)

Select.displayName = 'Select'

export default Select
