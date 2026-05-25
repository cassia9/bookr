import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { cn } from '../../lib/cn'

type ViewMode = 'month' | 'week' | 'day'

export default function CalendarPage() {
  const [view, setView] = useState<ViewMode>('week')

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
          <CalendarDays size={20} className="text-indigo-600" />
          行事曆
        </h1>

        <div className="flex items-center bg-slate-100 rounded-lg p-1 gap-1">
          {(['month', 'week', 'day'] as ViewMode[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                view === v
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              )}
            >
              {v === 'month' ? '月' : v === 'week' ? '週' : '日'}
            </button>
          ))}
        </div>
      </div>

      {/* Placeholder — 行事曆元件將在下一步實作 */}
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">
        <CalendarDays size={48} className="mx-auto mb-3 text-slate-200" />
        <p className="font-medium">行事曆載入中...</p>
        <p className="text-sm mt-1">目前視圖：{view === 'month' ? '當月' : view === 'week' ? '當週' : '當日'}</p>
      </div>
    </div>
  )
}
