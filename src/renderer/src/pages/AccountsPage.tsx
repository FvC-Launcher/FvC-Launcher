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
  WifiOff
} from 'lucide-react'
import { Avatar, Button, ConfirmDialog, EmptyState } from '@/components/ui'
import { AddAccountModal, useMicrosoftLogin } from '@/components/AddAccountModal'
import { formatRelative, useApp } from '@/store'
import type { Account } from '@shared/types'

export function AccountsPage(): ReactNode {
  const accounts = useApp((s) => s.accounts)
  const activeId = useApp((s) => s.activeAccountId)
  const pushNotification = useApp((s) => s.pushNotification)

  const [addOpen, setAddOpen] = useState(false)
  const [refreshing, setRefreshing] = useState<string | null>(null)
  const [removeTarget, setRemoveTarget] = useState<Account | null>(null)
  const { busy: msBusy, login: loginMicrosoft } = useMicrosoftLogin()

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

      <AddAccountModal open={addOpen} onClose={() => setAddOpen(false)} />

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
