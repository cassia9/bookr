import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { shadow } from '../../lib/styles'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  /** 主體內容（可滾動區域） */
  children: ReactNode
  /** 固定在底部的操作按鈕區（不隨內容捲動） */
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

export default function Modal({ open, onClose, title, children, footer, size = 'md' }: Props) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={cn(
        `relative bg-white rounded-3xl ${shadow.overlay} w-full flex flex-col`,
        /* 視窗最高 90vh，讓 header + footer 固定、body 可滾動 */
        'max-h-[90vh]',
        size === 'sm' && 'max-w-sm',
        size === 'md' && 'max-w-md',
        size === 'lg' && 'max-w-lg',
      )}>
        {/* ── 固定 Header ── */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-100 rounded-t-3xl">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* ── 可捲動主體 ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0">
          {children}
        </div>

        {/* ── 固定 Footer（若有傳入） ── */}
        {footer && (
          <div className="shrink-0 px-6 py-4 border-t border-slate-100 rounded-b-3xl bg-white">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
