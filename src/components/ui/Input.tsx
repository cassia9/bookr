import { forwardRef } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** 輸入框左側圖示 */
  prefix?: ReactNode
  /** 輸入框右側圖示 */
  suffix?: ReactNode
  /** 是否有錯誤（紅框） */
  error?: boolean
}

/**
 * Input — 文字輸入框
 * 樣式：rounded-2xl, focus:ring-indigo-400, h-10
 */
const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, prefix, suffix, error = false, disabled, ...props }, ref) => {
    return (
      <div className="relative flex items-center">
        {prefix && (
          <span className="absolute left-3 pointer-events-none text-slate-400 flex items-center">
            {prefix}
          </span>
        )}
        <input
          ref={ref}
          disabled={disabled}
          className={cn(
            'w-full h-10 text-sm bg-slate-50 border rounded-2xl transition-all',
            'placeholder:text-slate-400 text-slate-900',
            'focus:outline-none focus:ring-2 focus:bg-white',
            error
              ? 'border-red-400 ring-2 ring-red-100 bg-white'
              : 'border-slate-200 focus:border-indigo-400 focus:ring-indigo-100',
            prefix ? 'pl-9' : 'px-3',
            suffix ? 'pr-9' : 'pr-3',
            disabled && 'opacity-50 cursor-not-allowed',
            className,
          )}
          {...props}
        />
        {suffix && (
          <span className="absolute right-3 pointer-events-none text-slate-400 flex items-center">
            {suffix}
          </span>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'
export default Input
