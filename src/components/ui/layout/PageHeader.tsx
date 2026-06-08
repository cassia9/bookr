import { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface PageHeaderProps {
  /** 頁面標題 */
  title: string
  /** 頁面副標題（可選） */
  subtitle?: string
  /** 右側操作區域（可選） */
  action?: ReactNode
}

/**
 * PageHeader - 頁面頭部組件
 *
 * 在所有管理頁面頂部顯示標題、副標題和操作按鈕
 *
 * @example
 * ```tsx
 * <PageHeader
 *   title="從業人員管理"
 *   subtitle="管理老師、課程指派和休假時間"
 *   action={<Button onClick={...}>新增</Button>}
 * />
 * ```
 */
export default function PageHeader({
  title,
  subtitle,
  action,
}: PageHeaderProps) {
  return (
    <div className="bg-white px-6 py-6 shadow-md border-b border-slate-200">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-slate-900">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-slate-500 mt-2">
              {subtitle}
            </p>
          )}
        </div>

        {action && (
          <div className="flex items-center gap-3">
            {action}
          </div>
        )}
      </div>
    </div>
  )
}
