import { ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface ModalProps {
  /** 是否開啟 */
  isOpen: boolean
  /** 關閉回調 */
  onClose: () => void
  /** 模態框標題 */
  title: string
  /** 模態框副標題（可選） */
  subtitle?: string
  /** 模態框尺寸 */
  size?: 'sm' | 'md' | 'lg'
  /** 是否顯示關閉按鈕 */
  showCloseButton?: boolean
  /** 模態框內容 */
  children: ReactNode
}

const sizeClasses = {
  sm: 'max-w-sm',     // 384px
  md: 'max-w-2xl',    // 672px
  lg: 'max-w-4xl',    // 896px
}

/**
 * Modal - 模態框組件
 *
 * @example
 * ```tsx
 * <Modal
 *   isOpen={showModal}
 *   onClose={() => setShowModal(false)}
 *   title="新增老師"
 *   subtitle="添加一位新的老師到系統"
 *   size="lg"
 * >
 *   <div className="space-y-4">
 *     表單內容
 *   </div>
 * </Modal>
 * ```
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  size = 'md',
  showCloseButton = true,
  children,
}: ModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 背景遮罩 */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 模態框容器 */}
      <div
        className={cn(
          'relative w-full',
          sizeClasses[size],
          'bg-white rounded-xl shadow-2xl',
          'border border-slate-200',
          'max-h-[90vh] overflow-y-auto',
          'animate-in fade-in zoom-in-95'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 標題欄 */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-5 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {title}
            </h2>
            {subtitle && (
              <p className="text-sm text-slate-500 mt-1">
                {subtitle}
              </p>
            )}
          </div>

          {showCloseButton && (
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              aria-label="Close modal"
            >
              <X size={20} strokeWidth={1.5} />
            </button>
          )}
        </div>

        {/* 內容 */}
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  )
}
