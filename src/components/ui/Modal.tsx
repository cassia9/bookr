import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { shadow } from '../../lib/styles'
import IconButton from './IconButton'

const openModalStack: string[] = []

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
  const modalId = useId()
  const titleId = `${modalId}-title`
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return

    openModalStack.push(modalId)
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || openModalStack.at(-1) !== modalId) return
      event.preventDefault()
      event.stopImmediatePropagation()
      onCloseRef.current()
    }
    window.addEventListener('keydown', handler, true)

    return () => {
      window.removeEventListener('keydown', handler, true)
      const index = openModalStack.lastIndexOf(modalId)
      if (index >= 0) openModalStack.splice(index, 1)
    }
  }, [modalId, open])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          `relative bg-white rounded-3xl ${shadow.overlay} w-full flex flex-col`,
          /* 視窗最高 90vh，讓 header + footer 固定、body 可滾動 */
          'max-h-[90vh]',
          size === 'sm' && 'max-w-sm',
          size === 'md' && 'max-w-md',
          size === 'lg' && 'max-w-lg',
        )}
      >
        {/* ── 固定 Header ── */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-100 rounded-t-3xl">
          <h2 id={titleId} className="text-base font-semibold text-slate-900">{title}</h2>
          <IconButton icon={X} label="關閉" onClick={onClose} />
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
    </div>,
    document.body,
  )
}
