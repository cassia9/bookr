import { forwardRef, ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 按鈕變體 */
  variant?: 'primary' | 'secondary' | 'danger'
  /** 按鈕尺寸 */
  size?: 'sm' | 'md' | 'lg'
  /** 是否為載入狀態 */
  isLoading?: boolean
  /** 是否禁用 */
  disabled?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      disabled = false,
      className,
      children,
      ...props
    },
    ref
  ) => {
    // 基礎樣式
    const baseClasses = cn(
      'font-medium rounded-lg transition-all duration-200',
      'focus:outline-none focus:ring-2 focus:ring-offset-2',
      'active:scale-95',
      'disabled:opacity-50 disabled:cursor-not-allowed'
    )

    // 變體樣式
    const variantClasses = {
      primary: cn(
        'bg-black text-white hover:bg-slate-900 active:bg-black',
        'focus:ring-black',
        'shadow-md hover:shadow-lg'
      ),
      secondary: cn(
        'bg-slate-100 text-slate-900 hover:bg-slate-200',
        'border border-slate-200',
        'focus:ring-slate-300'
      ),
      danger: cn(
        'bg-red-100 text-red-700 hover:bg-red-200',
        'border border-red-200',
        'focus:ring-red-300'
      ),
    }

    // 尺寸樣式
    const sizeClasses = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2.5 text-sm',
      lg: 'px-6 py-3 text-base',
    }

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          baseClasses,
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'

export default Button
