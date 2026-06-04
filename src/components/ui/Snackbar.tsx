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

// ── Single item ───────────────────────────────────────────────────────────────
const CONFIG: Record<SnackbarType, { icon: React.ReactNode; bar: string; bg: string; title: string }> = {
  success: {
    icon: <CheckCircle size={18} strokeWidth={1.5} className="text-emerald-500 flex-shrink-0 mt-0.5" />,
    bar: 'bg-emerald-500',
    bg: 'bg-white',
    title: 'text-slate-900',
  },
  error: {
    icon: <XCircle size={18} strokeWidth={1.5} className="text-red-500 flex-shrink-0 mt-0.5" />,
    bar: 'bg-red-500',
    bg: 'bg-white',
    title: 'text-slate-900',
  },
  warning: {
    icon: <AlertCircle size={18} strokeWidth={1.5} className="text-amber-500 flex-shrink-0 mt-0.5" />,
    bar: 'bg-amber-500',
    bg: 'bg-white',
    title: 'text-slate-900',
  },
  info: {
    icon: <Info size={18} strokeWidth={1.5} className="text-blue-500 flex-shrink-0 mt-0.5" />,
    bar: 'bg-blue-500',
    bg: 'bg-white',
    title: 'text-slate-900',
  },
}

const DURATION = 3500

function SnackbarItem({ msg, onDismiss }: { msg: SnackbarMessage; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(false)
  const [progress, setProgress] = useState(100)
  const cfg = CONFIG[msg.type]

  // Mount animation
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  // Auto dismiss
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
        `pointer-events-auto w-80 rounded-3xl border border-slate-200 ${shadow.float} overflow-hidden transition-all duration-300`,
        cfg.bg,
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3',
      )}
    >
      <div className="flex items-start gap-3 px-4 pt-3.5 pb-3">
        {cfg.icon}
        <div className="flex-1 min-w-0">
          <p className={cn('text-sm font-semibold', cfg.title)}>{msg.title}</p>
          {msg.description && (
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{msg.description}</p>
          )}
        </div>
        <button
          onClick={handleDismiss}
          className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors flex-shrink-0 -mr-1"
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>
      {/* Progress bar */}
      <div className="h-0.5 bg-slate-100">
        <div
          className={cn('h-full transition-all', cfg.bar)}
          style={{ width: `${progress}%`, transition: 'width 50ms linear' }}
        />
      </div>
    </div>
  )
}
