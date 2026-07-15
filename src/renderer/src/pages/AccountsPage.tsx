import { useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import {
  BadgeCheck,
  Check,
  LogIn,
  Plus,
  RefreshCw,
  Trash2,
  User,
  UserPlus,
  WifiOff
} from 'lucide-react'
import { Avatar, Button, ConfirmDialog, EmptyState, Field, Input, Modal } from '@/components/ui'
import { formatRelative, useApp } from '@/store'
import type { Account } from '@shared/types'

export function AccountsPage(): ReactNode {
  const accounts = useApp((s) => s.accounts)
  const activeId = useApp((s) => s.activeAccountId)
  const refreshAccounts = useApp((s) => s.refreshAccounts)
  const pushNotification = useApp((s) => s.pushNotification)

  const [addOpen, setAddOpen] = useState(false)
  const [offlineOpen, setOfflineOpen] = useState(false)
  const [offlineName, setOfflineName] = useState('')
  const [msBusy, setMsBusy] = useState(false)
  const [refreshing, setRefreshing] = useState<string | null>(null)
  const [removeTarget, setRemoveTarget] = useState<Account | null>(null)

  const loginMicrosoft = async (): Promise<void> => {
    setMsBusy(true)
    try {
      const account = await window.fvc.accounts.loginMicrosoft()
      pushNotification({ type: 'success', title: `Signed in as ${account.username}` })
      setAddOpen(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // msmc reports a closed login window as "error.gui.closed" — treat as cancel.
      if (!/cancel|gui\.closed/i.test(message)) {
        pushNotification({ type: 'error', title: 'Sign-in failed', body: message })
      }
    } finally {
      setMsBusy(false)
      await refreshAccounts()
    }
  }

  const addOffline = async (): Promise<void> => {
    try {
      const account = await window.fvc.accounts.addOffline(offlineName)
      pushNotification({ type: 'success', title: `Added offline account ${account.username}` })
      setOfflineOpen(false)
      setOfflineName('')
    } catch (err) {
      pushNotification({
        type: 'error',
        title: 'Could not add account',
        body: err instanceof Error ? err.message : String(err)
      })
    }
  }

  const refreshSession = async (account: Account): Promise<void> => {
    setRefreshing(account.id)
    try {
      await window.fvc.accounts.refresh(account.id)
      pushNotification({ type: 'success', title: 'Session refreshed' })
    } catch {
      // needsRelogin notification comes from main
    } finally {
      setRefreshing(null)
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Accounts</h1>
          <div className="subtitle">Microsoft accounts stay signed in; offline accounts just need a name.</div>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => setAddOpen(true)}>
          Add account
        </Button>
      </div>

      {accounts.length === 0 ? (
        <EmptyState
          icon={User}
          title="No accounts"
          hint="Add a Microsoft account or create an offline session to play."
          action={
            <Button variant="primary" icon={Plus} onClick={() => setAddOpen(true)}>
              Add account
            </Button>
          }
        />
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          {accounts.map((account) => {
            const isActive = account.id === activeId
            return (
              <motion.div
                key={account.id}
                layout
                className="card mod-row"
                style={{
                  alignItems: 'center',
                  outline: isActive ? '2px solid rgba(var(--accent-rgb), 0.5)' : 'none'
                }}
              >
                <Avatar username={account.type === 'microsoft' ? account.username : ''} size={48} />
                <div className="mod-meta">
                  <div className="mod-title">
                    {account.username}
                    {isActive && <span className="badge accent">Default</span>}
                    {account.type === 'microsoft' ? (
                      account.needsRelogin ? (
                        <span className="badge error">Session expired</span>
                      ) : (
                        <span className="badge success">
                          <BadgeCheck size={11} /> Microsoft
                        </span>
                      )
                    ) : (
                      <span className="badge">
                        <WifiOff size={11} /> Offline
                      </span>
                    )}
                  </div>
                  <div className="tiny" style={{ marginTop: 3, fontFamily: 'Consolas, monospace' }}>
                    {account.uuid}
                  </div>
                  {account.type === 'microsoft' && account.expiresAt && !account.needsRelogin && (
                    <div className="tiny" style={{ marginTop: 2 }}>
                      Session valid · refreshed {formatRelative(account.addedAt)}
                    </div>
                  )}
                </div>
                <div className="row" style={{ gap: 8 }}>
                  {account.needsRelogin && (
                    <Button variant="primary" icon={LogIn} loading={msBusy} onClick={() => void loginMicrosoft()}>
                      Sign in again
                    </Button>
                  )}
                  {!isActive && (
                    <Button icon={Check} onClick={() => void window.fvc.accounts.setActive(account.id)}>
                      Use
                    </Button>
                  )}
                  {account.type === 'microsoft' && !account.needsRelogin && (
                    <Button
                      variant="subtle"
                      icon={RefreshCw}
                      loading={refreshing === account.id}
                      onClick={() => void refreshSession(account)}
                      aria-label="Refresh session"
                    />
                  )}
                  <Button variant="danger" icon={Trash2} onClick={() => setRemoveTarget(account)} aria-label="Remove" />
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Add account chooser */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add account">
        <div className="modal-body">
          <button
            className="card hoverable row"
            style={{ padding: 18, gap: 14, width: '100%', textAlign: 'left' }}
            onClick={() => void loginMicrosoft()}
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
            onClick={() => {
              setAddOpen(false)
              setOfflineOpen(true)
            }}
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
        </div>
      </Modal>

      {/* Offline username dialog */}
      <Modal
        open={offlineOpen}
        onClose={() => setOfflineOpen(false)}
        title="Offline account"
        footer={
          <>
            <Button onClick={() => setOfflineOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={!offlineName.trim()} onClick={() => void addOffline()}>
              Add
            </Button>
          </>
        }
      >
        <div className="modal-body">
          <Field label="Username">
            <Input
              autoFocus
              placeholder="Steve"
              value={offlineName}
              onChange={(e) => setOfflineName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && offlineName.trim() && void addOffline()}
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={removeTarget !== null}
        title={`Remove ${removeTarget?.username}?`}
        body={
          removeTarget?.type === 'microsoft'
            ? 'This signs the account out and deletes its stored session tokens from this computer.'
            : 'This removes the offline account from the launcher.'
        }
        confirmLabel="Remove"
        danger
        onCancel={() => setRemoveTarget(null)}
        onConfirm={() => {
          void window.fvc.accounts.remove(removeTarget!.id)
          setRemoveTarget(null)
        }}
      />
    </>
  )
}
