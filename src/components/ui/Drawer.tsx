/**
 * Drawer — 右側滑出抽屜
 * 用於：客戶詳情、不離頁的側邊資訊面板
 * 設計：overlay 遮罩 + slide-in 動畫 + 固定 header/footer、可捲動 body
 */
import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  /** 標題列右側（X 按鈕左邊）的額外操作按鈕，建議使用 IconButton */
  headerActions?: ReactNode
  footer?: ReactNode
  width?: 'sm' | 'md' | 'lg'
}

const widthCls = {
  sm: 'w-80',
  md: 'w-96',
  lg: 'w-[480px]',
}

export default function Drawer({
  open, onClose, title, subtitle, children, headerActions, footer, width = 'md',
}: Props) {
  // ESC 關閉
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // 開啟時鎖定 body scroll
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <>
      {/* Overlay */}
      <div
        className={cn(
          'fixed inset-0 bg-black/20 backdrop-blur-[1px] z-40 transition-opacity duration-300',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex flex-col bg-white shadow-2xl',
          'transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
          widthCls[width],
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Header */}
        <div className="shrink-0 flex items-start justify-between px-6 pt-6 pb-4 border-b border-slate-100">
          <div className="min-w-0 pr-4">
            <h2 className="text-base font-semibold text-slate-900 truncate">{title}</h2>
            {subtitle && (
              <p className="text-sm text-slate-400 mt-0.5 truncate">{subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            {headerActions}
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X size={16} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="shrink-0 px-6 py-4 border-t border-slate-100 bg-white">
            {footer}
          </div>
        )}
      </div>
    </>
  )
}
