import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { useApp } from '@/store'

const ICONS = {
  info: { icon: Info, color: 'var(--accent)' },
  success: { icon: CheckCircle2, color: 'var(--success)' },
  error: { icon: XCircle, color: 'var(--error)' },
  warning: { icon: AlertTriangle, color: 'var(--warning)' }
} as const

export function NotificationHost(): ReactNode {
  const notifications = useApp((s) => s.notifications)
  const dismiss = useApp((s) => s.dismissNotification)

  return (
    <div className="notifications">
      <AnimatePresence>
        {notifications.map((n) => {
          const { icon: Icon, color } = ICONS[n.type]
          return (
            <motion.div
              key={n.id}
              className="notification"
              initial={{ opacity: 0, x: 60, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 60, scale: 0.95 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              layout
              onClick={() => dismiss(n.id)}
            >
              <Icon style={{ color }} />
              <div>
                <div className="n-title">{n.title}</div>
                {n.body && <div className="n-body">{n.body}</div>}
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
