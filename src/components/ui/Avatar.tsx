import { cn } from '../../lib/cn'

type Shape = 'circle' | 'rounded'
type Size  = 'sm' | 'md' | 'lg' | 'xl'

const SIZE_CLS: Record<Size, string> = {
  sm: 'w-7  h-7  text-xs',
  md: 'w-9  h-9  text-sm',
  lg: 'w-11 h-11 text-base',
  xl: 'w-14 h-14 text-xl',
}
const SHAPE_CLS: Record<Shape, string> = {
  circle:  'rounded-full',
  rounded: 'rounded-2xl',
}

interface Props {
  name: string
  color?: string          // hex, e.g. '#6366f1'  — overrides bg
  bgClass?: string        // tailwind bg class, e.g. 'bg-indigo-100'
  textClass?: string      // tailwind text class
  size?: Size
  shape?: Shape
  className?: string
}

export default function Avatar({
  name, color, bgClass = 'bg-indigo-100', textClass = 'text-indigo-700',
  size = 'md', shape = 'circle', className,
}: Props) {
  const initial = name.trim()[0]?.toUpperCase() ?? '?'
  return (
    <div
      className={cn(
        'flex items-center justify-center font-semibold flex-shrink-0',
        SIZE_CLS[size],
        SHAPE_CLS[shape],
        !color && bgClass,
        !color && textClass,
        className,
      )}
      style={color ? { backgroundColor: color, color: '#fff' } : undefined}
    >
      {initial}
    </div>
  )
}
