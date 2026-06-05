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
      bg: 'bg-blue-900/30',
      border: 'border-blue-700/50',
      label: 'text-blue-400',
      value: 'text-blue-50',
    },
    green: {
      bg: 'bg-green-900/30',
      border: 'border-green-700/50',
      label: 'text-green-400',
      value: 'text-green-50',
    },
    red: {
      bg: 'bg-red-900/30',
      border: 'border-red-700/50',
      label: 'text-red-400',
      value: 'text-red-50',
    },
    amber: {
      bg: 'bg-amber-900/30',
      border: 'border-amber-700/50',
      label: 'text-amber-400',
      value: 'text-amber-50',
    },
    gray: {
      bg: 'bg-gray-900/30',
      border: 'border-gray-700/50',
      label: 'text-gray-400',
      value: 'text-gray-50',
    },
  }

  const config = colorConfig[color]

  return (
    <div
      className={cn(
        'bg-slate-800 border rounded-lg p-4 space-y-2',
        config.bg,
        config.border
      )}
    >
      <p className={cn('text-xs font-medium', config.label)}>{label}</p>
      <div className="flex items-end justify-between">
        <p className="text-3xl font-bold text-slate-50">{value}</p>
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
