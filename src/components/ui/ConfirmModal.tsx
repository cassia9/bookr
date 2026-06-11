import { AlertTriangle } from 'lucide-react'
import Modal from './Modal'
import Button from './Button'

interface Props {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  loading?: boolean
  title?: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  /** 危險操作用 danger 色；預設 danger */
  variant?: 'danger' | 'primary'
}

/**
 * ConfirmModal — 確認對話框
 * 用於刪除、取消等不可逆操作的二次確認
 */
export default function ConfirmModal({
  open, onClose, onConfirm, loading,
  title = '確認操作',
  description = '此操作無法撤銷，請確認後繼續。',
  confirmLabel = '確認',
  cancelLabel = '取消',
  variant = 'danger',
}: Props) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={variant} className="flex-1" loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="flex gap-3">
        <div className="w-9 h-9 rounded-2xl bg-red-50 flex items-center justify-center shrink-0">
          <AlertTriangle size={16} className="text-red-500" />
        </div>
        <p className="text-sm text-slate-600 leading-relaxed pt-1.5">{description}</p>
      </div>
    </Modal>
  )
}
