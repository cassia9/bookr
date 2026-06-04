import { cn } from '../../lib/cn'

type Size = 'sm' | 'md' | 'lg'

const SIZE_CLS: Record<Size, string> = {
  sm: 'w-4 h-4 border-2',
  md: 'w-6 h-6 border-2',
  lg: 'w-8 h-8 border-[3px]',
}

interface Props {
  size?: Size
  className?: string
}

export default function Spinner({ size = 'md', className }: Props) {
  return (
    <div className={cn(
      'rounded-full border-indigo-600 border-t-transparent animate-spin',
      SIZE_CLS[size],
      className,
    )} />
  )
}

/** 整頁居中的 loading 狀態 */
export function PageSpinner() {
  return (
    <div className="flex justify-center py-16">
      <Spinner size="md" />
    </div>
  )
}
