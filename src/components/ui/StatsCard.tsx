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
        'bg-white rounded-xl p-6 space-y-3 shadow-md hover:shadow-lg transition-all duration-200',
        'border border-border/50'
      )}
    >
      <div className={cn('inline-block px-2.5 py-1 rounded-md text-xs font-semibold', config.bg, config.label)}>
        {label}
      </div>
      <div className="flex items-end justify-between">
        <p className="text-4xl font-bold text-text-primary">{value}</p>
        {trend && (
          <div
            className={cn(
              'text-xs font-semibold flex items-center gap-1',
              trend.direction === 'up'
                ? 'text-success'
                : 'text-danger'
            )}
          >
            {trend.direction === 'up' ? '↑' : '↓'} {Math.abs(trend.value)}%
          </div>
        )}
      </div>
      {subtitle && (
        <p className="text-xs text-text-secondary">{subtitle}</p>
      )}
    </div>
  )
}
