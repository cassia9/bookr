import { cn } from '../../lib/cn'

export type BadgeVariant = 'indigo' | 'green' | 'amber' | 'red' | 'slate' | 'blue' | 'violet' | 'teal'

const VARIANT_CLS: Record<BadgeVariant, string> = {
  indigo: 'bg-indigo-100 text-indigo-700',
  green:  'bg-green-100  text-green-700',
  amber:  'bg-amber-100  text-amber-700',
  red:    'bg-red-100    text-red-600',
  slate:  'bg-slate-100  text-slate-500',
  blue:   'bg-blue-100   text-blue-700',
  violet: 'bg-violet-100 text-violet-700',
  teal:   'bg-teal-100   text-teal-700',
}

interface Props {
  children: React.ReactNode
  variant?: BadgeVariant
  className?: string
}

export default function Badge({ children, variant = 'slate', className }: Props) {
  return (
    <span className={cn(
      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
      VARIANT_CLS[variant],
      className,
    )}>
      {children}
    </span>
  )
}
