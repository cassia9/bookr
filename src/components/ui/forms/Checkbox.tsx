import { forwardRef, InputHTMLAttributes } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  /** 複選框旁邊的標籤文本 */
  label?: string
}

/**
 * Checkbox - 複選框
 *
 * @example
 * ```tsx
 * <Checkbox
 *   label="我同意服務條款"
 *   checked={agreed}
 *   onChange={(e) => setAgreed(e.target.checked)}
 * />
 * ```
 */
const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  (
    { className, label, disabled, checked, ...props },
    ref
  ) => {
    return (
      <label
        className={cn(
          'flex items-center gap-3 cursor-pointer',
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        )}
      >
        <div className="relative">
          <input
            ref={ref}
            type="checkbox"
            disabled={disabled}
            checked={checked}
            className="sr-only peer"
            {...props}
          />

          {/* 自訂複選框樣式 */}
          <div
            className={cn(
              'w-5 h-5 rounded-md border-2 transition-all duration-200',
              'peer-disabled:opacity-50',
              checked
                ? 'bg-black border-black'
                : 'border-slate-300 bg-white peer-hover:border-slate-400'
            )}
          />

          {/* 勾選標記 */}
          {checked && (
            <Check
              className="absolute top-0.5 left-0.5 w-4 h-4 text-white pointer-events-none"
              strokeWidth={3}
            />
          )}
        </div>

        {label && (
          <span
            className={cn(
              'text-sm',
              disabled ? 'text-slate-400' : 'text-slate-900'
            )}
          >
            {label}
          </span>
        )}
      </label>
    )
  }
)

Checkbox.displayName = 'Checkbox'

export default Checkbox
