import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { shadow } from '../../lib/styles'

export type SnackbarType = 'success' | 'error' | 'warning' | 'info'

export interface SnackbarMessage {
  id: string
  type: SnackbarType
  title: string
  description?: string
}

// ── Global singleton ──────────────────────────────────────────────────────────
type Listener = (msg: SnackbarMessage) => void
const listeners: Listener[] = []

export const toast = {
  success: (title: string, description?: string) => emit('success', title, description),
  error:   (title: string, description?: string) => emit('error',   title, description),
  warning: (title: string, description?: string) => emit('warning', title, description),
  info:    (title: string, description?: string) => emit('info',    title, description),
}

function emit(type: SnackbarType, title: string, description?: string) {
  const msg: SnackbarMessage = { id: Math.random().toString(36).slice(2), type, title, description }
  listeners.forEach(fn => fn(msg))
}

// ── Provider (mount once in layout) ──────────────────────────────────────────
export function SnackbarProvider() {
  const [msgs, setMsgs] = useState<SnackbarMessage[]>([])

  useEffect(() => {
    const handler = (msg: SnackbarMessage) => {
      setMsgs(prev => [...prev.slice(-3), msg])   // max 4 at a time
    }
    listeners.push(handler)
    return () => { const i = listeners.indexOf(handler); if (i >= 0) listeners.splice(i, 1) }
  }, [])

  function dismiss(id: string) {
    setMsgs(prev => prev.filter(m => m.id !== id))
  }

  return (
    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 pointer-events-none">
      {msgs.map(msg => (
        <SnackbarItem key={msg.id} msg={msg} onDismiss={dismiss} />
      ))}
    </div>
  )
}

// ── 與 Alert 元件相同的色系設定 ─────────────────────────────────────────────
const CONFIG: Record<SnackbarType, {
  icon: React.ReactNode
  bg: string
  border: string
  text: string
  desc: string
  progress: string
}> = {
  success: {
    icon: <CheckCircle size={16} strokeWidth={2} className="text-emerald-500 shrink-0 mt-0.5" />,
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-800',
    desc: 'text-emerald-600',
    progress: 'bg-emerald-400',
  },
  error: {
    icon: <XCircle size={16} strokeWidth={2} className="text-red-500 shrink-0 mt-0.5" />,
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-800',
    desc: 'text-red-500',
    progress: 'bg-red-400',
  },
  warning: {
    icon: <AlertCircle size={16} strokeWidth={2} className="text-amber-500 shrink-0 mt-0.5" />,
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-800',
    desc: 'text-amber-600',
    progress: 'bg-amber-400',
  },
  info: {
    icon: <Info size={16} strokeWidth={2} className="text-blue-500 shrink-0 mt-0.5" />,
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-800',
    desc: 'text-blue-500',
    progress: 'bg-blue-400',
  },
}

const DURATION = 3500

function SnackbarItem({ msg, onDismiss }: { msg: SnackbarMessage; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(false)
  const [progress, setProgress] = useState(100)
  const cfg = CONFIG[msg.type]

  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  useEffect(() => {
    const start = Date.now()
    const interval = setInterval(() => {
      const elapsed = Date.now() - start
      const remaining = Math.max(0, 100 - (elapsed / DURATION) * 100)
      setProgress(remaining)
      if (remaining === 0) {
        clearInterval(interval)
        setVisible(false)
        setTimeout(() => onDismiss(msg.id), 300)
      }
    }, 50)
    return () => clearInterval(interval)
  }, [msg.id, onDismiss])

  function handleDismiss() {
    setVisible(false)
    setTimeout(() => onDismiss(msg.id), 300)
  }

  return (
    <div
      className={cn(
        'pointer-events-auto w-80 rounded-2xl border overflow-hidden',
        shadow.float,
        'transition-all duration-300',
        cfg.bg, cfg.border,
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3',
      )}
    >
      <div className="flex items-start gap-3 px-4 pt-3.5 pb-3">
        {cfg.icon}
        <div className="flex-1 min-w-0">
          <p className={cn('text-sm font-semibold', cfg.text)}>{msg.title}</p>
          {msg.description && (
            <p className={cn('text-xs mt-0.5 leading-relaxed', cfg.desc)}>{msg.description}</p>
          )}
        </div>
        <button
          onClick={handleDismiss}
          className={cn('p-1 rounded-lg transition-opacity hover:opacity-60 shrink-0 -mr-1', cfg.text)}
        >
          <X size={13} strokeWidth={2} />
        </button>
      </div>
      {/* 進度條 */}
      <div className="h-0.5 bg-black/5">
        <div
          className={cn('h-full', cfg.progress)}
          style={{ width: `${progress}%`, transition: 'width 50ms linear' }}
        />
      </div>
    </div>
  )
}
