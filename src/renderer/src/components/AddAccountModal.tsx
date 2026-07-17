import { useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft, LogIn, UserPlus } from 'lucide-react'
import { Button, Field, Input, Modal } from '@/components/ui'
import { useApp } from '@/store'
import type { Account } from '@shared/types'

/** Microsoft OAuth trigger shared by the add-account flow and re-login buttons. */
export function useMicrosoftLogin(onSuccess?: (account: Account) => void): {
  busy: boolean
  login: () => Promise<void>
} {
  const pushNotification = useApp((s) => s.pushNotification)
  const refreshAccounts = useApp((s) => s.refreshAccounts)
  const [busy, setBusy] = useState(false)

  const login = async (): Promise<void> => {
    setBusy(true)
    try {
      const account = await window.fvc.accounts.loginMicrosoft()
      pushNotification({ type: 'success', title: `Signed in as ${account.username}` })
      onSuccess?.(account)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // Closing the login window is a cancel, not an error.
      if (!/cancel|gui\.closed/i.test(message)) {
        pushNotification({ type: 'error', title: 'Sign-in failed', body: message })
      }
    } finally {
      setBusy(false)
      await refreshAccounts()
    }
  }

  return { busy, login }
}

/**
 * "Add account" chooser: Microsoft OAuth or offline username. Used from the
 * Accounts page and from Play when no account exists yet.
 */
export function AddAccountModal({
  open,
  onClose,
  onAdded
}: {
  open: boolean
  onClose: () => void
  onAdded?: (account: Account) => void
}): ReactNode {
  const pushNotification = useApp((s) => s.pushNotification)
  const [stage, setStage] = useState<'choose' | 'offline'>('choose')
  const [offlineName, setOfflineName] = useState('')
  const { busy: msBusy, login } = useMicrosoftLogin((account) => {
    onClose()
    onAdded?.(account)
  })

  useEffect(() => {
    if (open) {
      setStage('choose')
      setOfflineName('')
    }
  }, [open])

  const addOffline = async (): Promise<void> => {
    try {
      const account = await window.fvc.accounts.addOffline(offlineName)
      pushNotification({ type: 'success', title: `Added offline account ${account.username}` })
      onClose()
      onAdded?.(account)
    } catch (err) {
      pushNotification({
        type: 'error',
        title: 'Could not add account',
        body: err instanceof Error ? err.message : String(err)
      })
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={stage === 'choose' ? 'Add account' : 'Offline account'}
      footer={
        stage === 'offline' ? (
          <>
            <Button icon={ArrowLeft} onClick={() => setStage('choose')}>
              Back
            </Button>
            <div style={{ flex: 1 }} />
            <Button variant="primary" disabled={!offlineName.trim()} onClick={() => void addOffline()}>
              Add
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="modal-body">
        {stage === 'choose' ? (
          <>
            <button
              className="card hoverable row"
              style={{ padding: 18, gap: 14, width: '100%', textAlign: 'left' }}
              onClick={() => void login()}
            >
              <span className="mod-icon" style={{ width: 46, height: 46, color: 'var(--accent)' }}>
                {msBusy ? <span className="spinner" /> : <LogIn size={20} />}
              </span>
              <div>
                <div style={{ fontWeight: 700 }}>Microsoft account</div>
                <div className="tiny" style={{ marginTop: 3, lineHeight: 1.4 }}>
                  Official sign-in for online play. Stays signed in until you log out.
                </div>
              </div>
            </button>
            <button
              className="card hoverable row"
              style={{ padding: 18, gap: 14, width: '100%', textAlign: 'left' }}
              onClick={() => setStage('offline')}
            >
              <span className="mod-icon" style={{ width: 46, height: 46 }}>
                <UserPlus size={20} />
              </span>
              <div>
                <div style={{ fontWeight: 700 }}>Offline account</div>
                <div className="tiny" style={{ marginTop: 3, lineHeight: 1.4 }}>
                  Just a username. For singleplayer and offline-mode servers.
                </div>
              </div>
            </button>
          </>
        ) : (
          <Field label="Username">
            <Input
              autoFocus
              placeholder="Steve"
              value={offlineName}
              onChange={(e) => setOfflineName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && offlineName.trim() && void addOffline()}
            />
          </Field>
        )}
      </div>
    </Modal>
  )
}
