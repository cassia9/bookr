import { NavLink } from 'react-router-dom'
import type { ElementType } from 'react'
import { cn } from '../../lib/cn'

interface Props {
  to: string
  icon: ElementType
  label: string
  onClick?: () => void
}

/**
 * SidebarNavItem — 側欄導覽項目
 *
 * 樣式：B · 左側光條
 *   Active  — 2.5px violet-600 左邊框 + violet-50 → transparent 漸層背景 + violet-700 文字
 *   Hover   — violet-500/6 背景 + violet-700 文字
 *   Default — 透明背景 + slate-500 文字
 *   Focus   — violet-400 focus ring（僅鍵盤觸發）
 */
export default function SidebarNavItem({ to, icon: Icon, label, onClick }: Props) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) => cn(
        'flex items-center gap-3 py-2.5 pr-3 text-sm font-medium transition-colors rounded-r-lg',
        'outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-inset',
        isActive
          ? [
              'border-l-[2.5px] border-violet-600 pl-[9.5px]',
              'bg-gradient-to-r from-violet-50 to-transparent',
              'text-violet-700',
            ]
          : [
              'border-l-[2.5px] border-transparent pl-[9.5px]',
              'text-slate-500',
              'hover:bg-violet-500/[.06] hover:text-violet-700',
            ],
      )}
    >
      {({ isActive }) => (
        <>
          <Icon
            size={17}
            strokeWidth={1.75}
            className={cn(
              'shrink-0 transition-colors',
              isActive ? 'text-violet-600' : 'text-slate-400 group-hover:text-violet-600',
            )}
          />
          {label}
        </>
      )}
    </NavLink>
  )
}
