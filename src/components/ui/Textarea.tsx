import { forwardRef } from 'react'
import type { TextareaHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean
}

/**
 * Textarea — 多行文字輸入
 * 樣式：rounded-2xl, focus:ring-indigo-400
 */
const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error = false, disabled, rows = 3, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        rows={rows}
        disabled={disabled}
        className={cn(
          'w-full px-3 py-2.5 text-sm bg-white border rounded-2xl transition-shadow resize-none',
          'placeholder:text-slate-300 text-slate-900',
          'focus:outline-none focus:ring-2',
          error
            ? 'border-red-400 focus:ring-red-200'
            : 'border-slate-200 focus:ring-indigo-400',
          disabled && 'opacity-50 cursor-not-allowed bg-slate-50',
          className,
        )}
        {...props}
      />
    )
  }
)

Textarea.displayName = 'Textarea'
export default Textarea
