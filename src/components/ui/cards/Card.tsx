import { forwardRef, HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** 卡片變體 */
  variant?: 'default' | 'stats' | 'data'
  /** 陰影大小 */
  shadow?: 'sm' | 'md' | 'lg'
  /** 是否添加交互效果 */
  interactive?: boolean
}

/**
 * Card - 基礎卡片容器
 *
 * @example
 * ```tsx
 * <Card>
 *   <CardHeader><h2>標題</h2></CardHeader>
 *   <CardBody>內容</CardBody>
 *   <CardFooter><Button>操作</Button></CardFooter>
 * </Card>
 * ```
 */
const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      variant = 'default',
      shadow = 'sm',
      interactive = false,
      className,
      children,
      ...props
    },
    ref
  ) => {
    const baseClasses = cn(
      'bg-white',
      'border border-slate-200',
      'rounded-lg',
      'transition-all duration-200'
    )

    const shadowClasses = {
      sm: 'shadow-sm',
      md: 'shadow-md',
      lg: 'shadow-lg',
    }

    const interactiveClasses = interactive
      ? 'cursor-pointer hover:shadow-md'
      : ''

    return (
      <div
        ref={ref}
        className={cn(
          baseClasses,
          shadowClasses[shadow],
          interactiveClasses,
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)

Card.displayName = 'Card'

/**
 * CardHeader - 卡片頭部區域
 */
export const CardHeader = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'px-6 py-4',
      'border-b border-slate-200',
      className
    )}
    {...props}
  />
))

CardHeader.displayName = 'CardHeader'

/**
 * CardBody - 卡片主要內容區域
 */
export const CardBody = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('px-6 py-4', className)}
    {...props}
  />
))

CardBody.displayName = 'CardBody'

/**
 * CardFooter - 卡片底部區域（通常放按鈕）
 */
export const CardFooter = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'px-6 py-4',
      'border-t border-slate-200',
      className
    )}
    {...props}
  />
))

CardFooter.displayName = 'CardFooter'

export default Card
