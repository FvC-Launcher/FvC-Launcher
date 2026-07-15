import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, User, X, type LucideIcon } from 'lucide-react'

// ----------------------------------------------------------------- Button

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'subtle' | 'danger' | 'outline'
  icon?: LucideIcon
  loading?: boolean
}

export function Button({
  variant = 'ghost',
  icon: Icon,
  loading,
  children,
  className = '',
  disabled,
  ...rest
}: ButtonProps): ReactNode {
  return (
    <button
      className={`btn btn-${variant} ${!children ? 'btn-icon' : ''} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <span className="spinner" /> : Icon && <Icon />}
      {children}
    </button>
  )
}

// ----------------------------------------------------------------- Avatar

/**
 * Minecraft head avatar (api.mcheads.org) with a React-safe fallback. Pass an
 * empty username for offline accounts — they always get the default icon.
 */
export function Avatar({ username, size = 40, radius = 10 }: { username: string; size?: number; radius?: number }): ReactNode {
  const [failed, setFailed] = useState(false)
  if (failed || !username) {
    return (
      <span className="mod-icon" style={{ width: size, height: size, borderRadius: radius }}>
        <User size={size * 0.45} />
      </span>
    )
  }
  return (
    <img
      src={`https://api.mcheads.org/head/${encodeURIComponent(username)}/${size * 2}`}
      alt=""
      width={size}
      height={size}
      style={{ borderRadius: radius, flexShrink: 0 }}
      onError={() => setFailed(true)}
    />
  )
}

// ----------------------------------------------------------------- Input

export function Input(props: InputHTMLAttributes<HTMLInputElement>): ReactNode {
  return <input {...props} className={`input ${props.className ?? ''}`} />
}

export function Field({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  )
}

// ----------------------------------------------------------------- Select

export interface SelectOption {
  value: string
  label: string
  hint?: string
}

export function Select({
  value,
  options,
  onChange,
  placeholder = 'Select…',
  disabled
}: {
  value: string | undefined
  options: SelectOption[]
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
}): ReactNode {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const selected = options.find((o) => o.value === value)

  return (
    <div className="select" ref={ref}>
      <button
        type="button"
        className="select-trigger"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected?.label ?? <span style={{ color: 'var(--text-3)' }}>{placeholder}</span>}
        </span>
        <ChevronDown
          size={15}
          style={{
            flexShrink: 0,
            transition: 'transform var(--dur-fast) var(--ease)',
            transform: open ? 'rotate(180deg)' : undefined
          }}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="select-menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
          >
            {options.length === 0 && (
              <div className="select-option" style={{ cursor: 'default' }}>
                No options
              </div>
            )}
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`select-option ${option.value === value ? 'selected' : ''}`}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
              >
                <span>
                  {option.label}
                  {option.hint && (
                    <span style={{ color: 'var(--text-3)', marginLeft: 8, fontSize: '0.76rem' }}>
                      {option.hint}
                    </span>
                  )}
                </span>
                {option.value === value && <Check size={14} />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ----------------------------------------------------------------- Toggle

export function Toggle({
  checked,
  onChange,
  disabled
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}): ReactNode {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`toggle ${checked ? 'on' : ''}`}
      onClick={() => !disabled && onChange(!checked)}
      style={disabled ? { opacity: 0.5 } : undefined}
    />
  )
}

// ----------------------------------------------------------------- Slider

export function Slider({
  min,
  max,
  step = 1,
  value,
  onChange,
  format
}: {
  min: number
  max: number
  step?: number
  value: number
  onChange: (value: number) => void
  format?: (value: number) => string
}): ReactNode {
  const fill = ((value - min) / (max - min)) * 100
  return (
    <div className="row" style={{ width: '100%', gap: 14 }}>
      <input
        type="range"
        className="slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ['--slider-fill' as never]: `${fill}%` }}
      />
      {format && (
        <span
          style={{
            fontSize: '0.82rem',
            fontWeight: 600,
            color: 'var(--text-2)',
            minWidth: 72,
            textAlign: 'right',
            fontVariantNumeric: 'tabular-nums'
          }}
        >
          {format(value)}
        </span>
      )}
    </div>
  )
}

// ----------------------------------------------------------------- Progress

export function Progress({ value }: { value: number }): ReactNode {
  const indeterminate = value < 0
  return (
    <div className={`progress ${indeterminate ? 'indeterminate' : ''}`}>
      <div style={{ width: indeterminate ? undefined : `${Math.min(100, value * 100)}%` }} />
    </div>
  )
}

// ----------------------------------------------------------------- Modal

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}): ReactNode {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Portal to <body> so the fixed backdrop centers against the viewport,
  // not against a page wrapper whose CSS animation creates a containing block.
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            className={`modal ${wide ? 'wide' : ''}`}
            initial={{ opacity: 0, scale: 0.95, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 14 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {title !== undefined && (
              <div className="modal-header">
                <h2>{title}</h2>
                <Button variant="subtle" icon={X} onClick={onClose} aria-label="Close" />
              </div>
            )}
            {children}
            {footer && <div className="modal-footer">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

// ----------------------------------------------------------------- Empty state

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action
}: {
  icon: LucideIcon
  title: string
  hint?: string
  action?: ReactNode
}): ReactNode {
  return (
    <div className="empty-state">
      <Icon />
      <div>
        <h3 style={{ color: 'var(--text-2)' }}>{title}</h3>
        {hint && <p style={{ fontSize: '0.84rem', marginTop: 4 }}>{hint}</p>}
      </div>
      {action}
    </div>
  )
}

// ----------------------------------------------------------------- Tabs

export function Tabs({
  tabs,
  active,
  onChange
}: {
  tabs: { id: string; label: string }[]
  active: string
  onChange: (id: string) => void
}): ReactNode {
  return (
    <div className="tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tab ${tab.id === active ? 'active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.id === active && (
            <motion.span
              className="tab-bg"
              layoutId="tab-bg"
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            />
          )}
          {tab.label}
        </button>
      ))}
    </div>
  )
}

// ----------------------------------------------------------------- Setting row

export function SettingRow({
  label,
  description,
  children
}: {
  label: string
  description?: string
  children: ReactNode
}): ReactNode {
  return (
    <div className="setting-row">
      <div>
        <div className="s-label">{label}</div>
        {description && <div className="s-desc">{description}</div>}
      </div>
      <div className="s-control">{children}</div>
    </div>
  )
}

// ----------------------------------------------------------------- Confirm dialog

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  danger,
  onConfirm,
  onCancel,
  extra
}: {
  open: boolean
  title: string
  body?: ReactNode
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
  extra?: ReactNode
}): ReactNode {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="modal-body">
        {typeof body === 'string' ? <p className="muted" style={{ lineHeight: 1.5 }}>{body}</p> : body}
        {extra}
      </div>
    </Modal>
  )
}
