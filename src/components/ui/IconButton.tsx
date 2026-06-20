import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ElementType } from 'react'
import { cn } from '../../lib/cn'

type Variant = 'default' | 'danger' | 'ghost'
type Size = 'sm' | 'md'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Lucide 或任意 React 元件，會以 size prop 渲染 */
  icon: ElementType
  /** 無障礙標籤（aria-label），同時作為 tooltip */
  label: string
  variant?: Variant
  size?: Size
}

/**
 * IconButton — 僅含圖示的按鈕
 * 用途：工具列、Drawer 標題列、表格操作列等空間受限場景
 *
 * variant:
 *   default  — slate 圖示，hover 淺灰背景（最常用）
 *   danger   — slate 圖示，hover 紅色背景 + 紅色圖示（刪除類操作）
 *   ghost    — slate 圖示，hover 極淡灰（更低調）
 */
const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon: Icon, label, variant = 'default', size = 'md', className, disabled, ...props }, ref) => {
    const iconSize = size === 'sm' ? 14 : 16

    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        title={label}
        disabled={disabled}
        className={cn(
          'inline-flex items-center justify-center rounded-xl transition-all duration-150',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1',
          size === 'sm' && 'w-7 h-7',
          size === 'md' && 'w-8 h-8',
          variant === 'default' && [
            'text-slate-400 hover:text-slate-600',
            'hover:bg-slate-100 active:bg-slate-200',
          ],
          variant === 'danger' && [
            'text-slate-400 hover:text-red-500',
            'hover:bg-red-50 active:bg-red-100',
          ],
          variant === 'ghost' && [
            'text-slate-300 hover:text-slate-500',
            'hover:bg-slate-50 active:bg-slate-100',
          ],
          className,
        )}
        {...props}
      >
        <Icon size={iconSize} strokeWidth={1.75} />
      </button>
    )
  }
)

IconButton.displayName = 'IconButton'
export default IconButton
