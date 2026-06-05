import { cn } from '@/lib/cn'

interface StatsCardProps {
  label: string
  value: number | string
  subtitle?: string
  color?: 'blue' | 'green' | 'red' | 'amber' | 'gray'
  trend?: {
    value: number
    direction: 'up' | 'down'
  }
}

export default function StatsCard({
  label,
  value,
  subtitle,
  color = 'blue',
  trend,
}: StatsCardProps) {
  const colorConfig = {
    blue: {
      bg: 'bg-info-light',
      border: 'border-info',
      label: 'text-info',
      value: 'text-text-primary',
    },
    green: {
      bg: 'bg-success-light',
      border: 'border-success',
      label: 'text-success',
      value: 'text-text-primary',
    },
    red: {
      bg: 'bg-danger-light',
      border: 'border-danger',
      label: 'text-danger',
      value: 'text-text-primary',
    },
    amber: {
      bg: 'bg-warning-light',
      border: 'border-warning',
      label: 'text-warning',
      value: 'text-text-primary',
    },
    gray: {
      bg: 'bg-surface-secondary',
      border: 'border-border',
      label: 'text-text-secondary',
      value: 'text-text-primary',
    },
  }

  const config = colorConfig[color]

  return (
    <div
      className={cn(
        'bg-white border rounded-lg p-4 space-y-2 shadow-sm',
        config.bg,
        config.border
      )}
    >
      <p className={cn('text-xs font-medium', config.label)}>{label}</p>
      <div className="flex items-end justify-between">
        <p className="text-3xl font-bold text-text-primary">{value}</p>
        {trend && (
          <div
            className={cn(
              'text-xs font-semibold flex items-center gap-1',
              trend.direction === 'up'
                ? 'text-green-400'
                : 'text-red-400'
            )}
          >
            {trend.direction === 'up' ? '↑' : '↓'} {Math.abs(trend.value)}%
          </div>
        )}
      </div>
      {subtitle && (
        <p className="text-xs text-slate-400">{subtitle}</p>
      )}
    </div>
  )
}
