import { cn } from '../../lib/cn'

interface Props {
  checked: boolean
  onChange: (val: boolean) => void
  disabled?: boolean
  ariaLabel?: string
}

export default function Toggle({ checked, onChange, disabled, ariaLabel }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative w-9 h-5 rounded-full transition-colors focus:outline-none',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        checked ? 'bg-indigo-600' : 'bg-slate-300',
      )}
    >
      <span className={cn(
        'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
        checked && 'translate-x-4',
      )} />
    </button>
  )
}
