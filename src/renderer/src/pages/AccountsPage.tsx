import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import {
  BarChart3,
  Check,
  ChevronRight,
  Clock,
  Copy,
  LogIn,
  Plus,
  RefreshCw,
  Rocket,
  Shirt,
  Timer,
  Trash2,
  User
} from 'lucide-react'
import { Avatar, Button, ConfirmDialog, EmptyState } from '@/components/ui'
import { AddAccountModal, useMicrosoftLogin } from '@/components/AddAccountModal'
import { AccountDetailsModal, StatusBadge } from '@/components/AccountDetailsModal'
import { SkinViewer } from '@/components/SkinViewer'
import { formatPlayTime, formatRelative, useApp } from '@/store'
import type { Account, AccountStats, SkinModel } from '@shared/types'

export function AccountsPage(): ReactNode {
  const accounts = useApp((s) => s.accounts)
  const activeId = useApp((s) => s.activeAccountId)
  const pushNotification = useApp((s) => s.pushNotification)

  const [addOpen, setAddOpen] = useState(false)
  const [refreshing, setRefreshing] = useState<string | null>(null)
  const [removeTarget, setRemoveTarget] = useState<Account | null>(null)
  const [detailsId, setDetailsId] = useState<string | null>(null)
  const [stats, setStats] = useState<Record<string, AccountStats>>({})
  const { busy: msBusy, login: loginMicrosoft } = useMicrosoftLogin()

  const active = accounts.find((a) => a.id === activeId) ?? null
  const details = accounts.find((a) => a.id === detailsId) ?? null

  useEffect(() => {
    const load = (): void => {
      void window.fvc.accounts.stats().then(setStats)
    }
    load()
    return window.fvc.accounts.onStatsChanged(load)
  }, [])

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

  const switchTo = (account: Account): void => {
    void window.fvc.accounts
      .setActive(account.id)
      .catch((err) => pushNotification({ type: 'error', title: 'Could not switch', body: String(err) }))
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
        <div className="stack" style={{ gap: 22 }}>
          {active && (
            <ActiveAccountHero
              account={active}
              refreshing={refreshing === active.id}
              signingIn={msBusy}
              onRefresh={() => void refreshSession(active)}
              onSignIn={() => void loginMicrosoft()}
              onDetails={() => setDetailsId(active.id)}
            />
          )}

          <section className="stack" style={{ gap: 12 }}>
            <div className="acc-section-head">
              <h2>All accounts</h2>
              <span className="tiny">
                {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}
              </span>
            </div>

            <div className="acc-grid">
              {accounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  stats={stats[account.id]}
                  active={account.id === activeId}
                  refreshing={refreshing === account.id}
                  signingIn={msBusy}
                  onUse={() => switchTo(account)}
                  onRefresh={() => void refreshSession(account)}
                  onSignIn={() => void loginMicrosoft()}
                  onRemove={() => setRemoveTarget(account)}
                  onOpen={() => setDetailsId(account.id)}
                />
              ))}

              <motion.button layout className="pf-new acc-new" onClick={() => setAddOpen(true)}>
                <span className="pf-new-icon">
                  <Plus size={22} />
                </span>
                <span className="pf-new-title">Add account</span>
                <span className="tiny">Microsoft or offline</span>
              </motion.button>
            </div>
          </section>
        </div>
      )}

      <AddAccountModal open={addOpen} onClose={() => setAddOpen(false)} />

      <AccountDetailsModal
        account={details}
        stats={details ? stats[details.id] : undefined}
        active={details?.id === activeId}
        refreshing={refreshing === details?.id}
        signingIn={msBusy}
        onClose={() => setDetailsId(null)}
        onUse={() => details && switchTo(details)}
        onRefresh={() => details && void refreshSession(details)}
        onSignIn={() => void loginMicrosoft()}
        onRemove={() => {
          setRemoveTarget(details)
          setDetailsId(null)
        }}
      />

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

// ============================================================== Status

function statusLine(account: Account): string {
  if (account.type === 'offline') return `Offline · added ${formatRelative(account.addedAt)}`
  if (account.needsRelogin) return 'Sign in again to keep playing online'
  return `Signed in · refreshed ${formatRelative(account.addedAt)}`
}

// ============================================================== Hero

/**
 * Microsoft accounts show their real skin (including one just changed, which Mojang's
 * public lookups lag behind); offline ones the skin applied via FvC Skins, or the default.
 */
function useAccountSkin(account: Account): { dataUrl: string; model: SkinModel } | null {
  const [skin, setSkin] = useState<{ dataUrl: string; model: SkinModel } | null>(null)

  useEffect(() => {
    setSkin(null)
    let cancelled = false
    const refresh = (): void => {
      window.fvc.skins
        .forAccount(account.id)
        .then(({ skin: s }) => {
          if (!cancelled) setSkin(s ? { dataUrl: s.dataUrl, model: s.model } : null)
        })
        .catch(() => {
          // No skin available — the hero falls back to the default glyph.
        })
    }
    refresh()
    const unsubscribe = window.fvc.skins.onChanged(refresh)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [account.id, account.type, account.username])

  return skin
}

function ActiveAccountHero({
  account,
  refreshing,
  signingIn,
  onRefresh,
  onSignIn,
  onDetails
}: {
  account: Account
  refreshing: boolean
  signingIn: boolean
  onRefresh: () => void
  onSignIn: () => void
  onDetails: () => void
}): ReactNode {
  const navigate = useApp((s) => s.navigate)
  const pushNotification = useApp((s) => s.pushNotification)
  const skin = useAccountSkin(account)
  const expired = account.type === 'microsoft' && account.needsRelogin

  const copyUuid = (): void => {
    void navigator.clipboard
      .writeText(account.uuid)
      .then(() => pushNotification({ type: 'success', title: 'UUID copied' }))
      .catch(() => pushNotification({ type: 'error', title: 'Could not copy UUID' }))
  }

  return (
    <section className={`acc-hero ${expired ? 'expired' : ''}`}>
      <div className="acc-hero-info">
        <div className="pf-hero-label">Playing as</div>
        <h1 className="acc-hero-name" title={account.username}>
          {account.username}
        </h1>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <StatusBadge account={account} />
          <span className="tiny">{statusLine(account)}</span>
        </div>

        <button className="acc-uuid" onClick={copyUuid} title="Copy UUID">
          <span>{account.uuid}</span>
          <Copy size={13} />
        </button>

        <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 'auto' }}>
          {expired ? (
            <Button variant="primary" icon={LogIn} loading={signingIn} onClick={onSignIn}>
              Sign in again
            </Button>
          ) : (
            <Button variant="primary" icon={Shirt} onClick={() => navigate('skin')}>
              Change skin
            </Button>
          )}
          <Button icon={BarChart3} onClick={onDetails}>
            Stats &amp; details
          </Button>
          {account.type === 'microsoft' && !expired && (
            <Button icon={RefreshCw} loading={refreshing} onClick={onRefresh}>
              Refresh session
            </Button>
          )}
        </div>
      </div>

      <button className="acc-hero-model" onClick={onDetails} title="View stats and details">
        {skin ? (
          <motion.div
            key={skin.dataUrl}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <SkinViewer dataUrl={skin.dataUrl} model={skin.model} scale={7} />
          </motion.div>
        ) : (
          <span className="acc-hero-fallback">
            <User size={72} strokeWidth={1.25} />
          </span>
        )}
      </button>
    </section>
  )
}

// ============================================================== Card

function AccountCard({
  account,
  stats,
  active,
  refreshing,
  signingIn,
  onUse,
  onRefresh,
  onSignIn,
  onRemove,
  onOpen
}: {
  account: Account
  stats: AccountStats | undefined
  active: boolean
  refreshing: boolean
  signingIn: boolean
  onUse: () => void
  onRefresh: () => void
  onSignIn: () => void
  onRemove: () => void
  onOpen: () => void
}): ReactNode {
  const expired = account.type === 'microsoft' && account.needsRelogin
  const played = !!stats && stats.launches > 0
  return (
    <motion.div
      layout
      role="button"
      tabIndex={0}
      title="View stats and details"
      className={`acc-card ${active ? 'active' : ''} ${expired ? 'expired' : ''}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && e.key === 'Enter') onOpen()
      }}
    >
      <div className="acc-card-head">
        <Avatar username={account.type === 'microsoft' ? account.username : ''} size={52} radius={12} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="acc-card-name" title={account.username}>
            {account.username}
          </div>
          <div style={{ marginTop: 5 }}>
            <StatusBadge account={account} />
          </div>
        </div>
        {active && (
          <span className="acc-active-pill">
            <Check size={12} /> In use
          </span>
        )}
        <ChevronRight size={16} className="acc-card-chev" />
      </div>

      <div className="tiny acc-card-status">{statusLine(account)}</div>

      <div className="acc-card-stats tiny">
        {played ? (
          <>
            <span title="Play time">
              <Timer size={12} /> {formatPlayTime(stats.playTimeSeconds)}
            </span>
            <span title="Launches">
              <Rocket size={12} /> {stats.launches} {stats.launches === 1 ? 'launch' : 'launches'}
            </span>
            <span title="Last played">
              <Clock size={12} /> {formatRelative(stats.lastPlayed)}
            </span>
          </>
        ) : (
          <span>No games played yet</span>
        )}
      </div>

      {/* The card itself opens the details, so its buttons must not bubble up. */}
      <div className="acc-card-actions" onClick={(e) => e.stopPropagation()}>
        {expired ? (
          <Button variant="primary" icon={LogIn} loading={signingIn} onClick={onSignIn}>
            Sign in
          </Button>
        ) : active ? (
          <Button disabled icon={Check}>
            Default
          </Button>
        ) : (
          <Button icon={Check} onClick={onUse}>
            Use
          </Button>
        )}
        <div className="row" style={{ gap: 6, marginLeft: 'auto' }}>
          {account.type === 'microsoft' && !expired && (
            <Button
              variant="subtle"
              icon={RefreshCw}
              loading={refreshing}
              onClick={onRefresh}
              title="Refresh session"
              aria-label="Refresh session"
            />
          )}
          <Button variant="danger" icon={Trash2} onClick={onRemove} title="Remove" aria-label="Remove" />
        </div>
      </div>
    </motion.div>
  )
}
