import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  AlertTriangle,
  BadgeCheck,
  CalendarDays,
  Check,
  Clock,
  Copy,
  Fingerprint,
  Globe,
  Hourglass,
  KeyRound,
  LogIn,
  RefreshCw,
  Rocket,
  Shirt,
  Star,
  Timer,
  Trash2,
  User,
  WifiOff,
  X,
  type LucideIcon
} from 'lucide-react'
import { Button, Modal } from '@/components/ui'
import { SkinViewer } from '@/components/SkinViewer'
import { formatPlayTime, formatRelative, useApp } from '@/store'
import { profileIcon } from '@/lib'
import type { Account, AccountAppearance, AccountStats } from '@shared/types'

const MODEL_SCALE = 9

export function StatusBadge({ account }: { account: Account }): ReactNode {
  if (account.type === 'offline') {
    return (
      <span className="badge">
        <WifiOff size={11} /> Offline
      </span>
    )
  }
  if (account.needsRelogin) {
    return (
      <span className="badge error">
        <AlertTriangle size={11} /> Session expired
      </span>
    )
  }
  return (
    <span className="badge success">
      <BadgeCheck size={11} /> Microsoft
    </span>
  )
}

function formatDate(iso: string | undefined, withTime = false): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {})
  })
}

/** Loads what the account wears, and reloads when a skin changes in game. */
function useAppearance(account: Account | null): { appearance: AccountAppearance | null; failed: boolean } {
  const [appearance, setAppearance] = useState<AccountAppearance | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!account) return
    setAppearance(null)
    setFailed(false)
    let cancelled = false
    const load = (): void => {
      window.fvc.skins
        .forAccount(account.id)
        .then((a) => !cancelled && setAppearance(a))
        .catch(() => !cancelled && setFailed(true))
    }
    load()
    const unsubscribe = window.fvc.skins.onChanged(load)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [account?.id])

  return { appearance, failed }
}

export function AccountDetailsModal({
  account,
  stats,
  active,
  refreshing,
  signingIn,
  onClose,
  onUse,
  onRefresh,
  onSignIn,
  onRemove
}: {
  /** Null closes the dialog. */
  account: Account | null
  stats: AccountStats | undefined
  active: boolean
  refreshing: boolean
  signingIn: boolean
  onClose: () => void
  onUse: () => void
  onRefresh: () => void
  onSignIn: () => void
  onRemove: () => void
}): ReactNode {
  // Keep showing the last account while the dialog animates out.
  const last = useRef(account)
  if (account) last.current = account
  const shown = account ?? last.current

  const navigate = useApp((s) => s.navigate)
  const { appearance, failed } = useAppearance(account)
  const expired = shown?.type === 'microsoft' && !!shown.needsRelogin

  const footer = shown && (
    <>
      <Button variant="danger" icon={Trash2} onClick={onRemove} style={{ marginRight: 'auto' }}>
        Remove
      </Button>
      {shown.type === 'microsoft' && !expired && (
        <Button icon={RefreshCw} loading={refreshing} onClick={onRefresh}>
          Refresh session
        </Button>
      )}
      {active && !expired && (
        <Button
          icon={Shirt}
          onClick={() => {
            onClose()
            navigate('skin')
          }}
        >
          Change skin
        </Button>
      )}
      {expired ? (
        <Button variant="primary" icon={LogIn} loading={signingIn} onClick={onSignIn}>
          Sign in again
        </Button>
      ) : active ? (
        <Button variant="primary" icon={Check} disabled>
          In use
        </Button>
      ) : (
        <Button variant="primary" icon={Check} onClick={onUse}>
          Use this account
        </Button>
      )}
    </>
  )

  return (
    <Modal open={account !== null} onClose={onClose} className="acc-details" footer={footer}>
      {shown && (
        <div className="acc-d">
          <SkinStage account={shown} appearance={appearance} failed={failed} />
          <div className="acc-d-main">
            <header className="acc-d-head">
              <div style={{ minWidth: 0 }}>
                <div className="acc-d-eyebrow">Account</div>
                <h2 className="acc-d-name" title={shown.username}>
                  {shown.username}
                </h2>
                <div className="row" style={{ gap: 6, marginTop: 8 }}>
                  <StatusBadge account={shown} />
                  {active && (
                    <span className="acc-active-pill">
                      <Check size={12} /> In use
                    </span>
                  )}
                </div>
              </div>
              <Button variant="subtle" icon={X} onClick={onClose} aria-label="Close" />
            </header>

            <StatsGrid account={shown} stats={stats} />
            <DetailRows account={shown} appearance={appearance} failed={failed} />
            <ProfileBreakdown stats={stats} />
          </div>
        </div>
      )}
    </Modal>
  )
}

// ============================================================== Skin stage

function SkinStage({
  account,
  appearance,
  failed
}: {
  account: Account
  appearance: AccountAppearance | null
  failed: boolean
}): ReactNode {
  const [view, setView] = useState<'front' | 'back'>('front')
  const skin = appearance?.skin
  const cape = appearance?.capeDataUrl

  return (
    <aside className="acc-d-stage">
      <div className="acc-d-model">
        {skin ? (
          <div className="acc-d-figure">
            <SkinViewer dataUrl={skin.dataUrl} model={skin.model} view={view} scale={MODEL_SCALE} />
            {/* Seen from behind, the cape hangs over the torso: 1px wider on each side, from the shoulders down. */}
            {cape && view === 'back' && (
              <CapeCanvas
                dataUrl={cape}
                scale={MODEL_SCALE}
                className="acc-d-cape-worn"
                style={{ left: 3 * MODEL_SCALE, top: 8 * MODEL_SCALE }}
              />
            )}
          </div>
        ) : failed || appearance ? (
          <span className="acc-hero-fallback">
            <User size={64} strokeWidth={1.25} />
          </span>
        ) : (
          <span className="spinner" style={{ width: 28, height: 28 }} />
        )}
      </div>

      {skin && (
        <div className="segmented acc-d-view" role="radiogroup" aria-label="Skin view">
          {(['front', 'back'] as const).map((v) => (
            <button
              key={v}
              role="radio"
              aria-checked={view === v}
              className={view === v ? 'active' : ''}
              onClick={() => setView(v)}
            >
              {v === 'front' ? 'Front' : 'Back'}
            </button>
          ))}
        </div>
      )}

      <div className="acc-d-chips">
        {skin && <span className="home-chip">{skin.model === 'slim' ? 'Slim arms' : 'Classic arms'}</span>}
        {skin && (
          <span className="home-chip">
            {skin.source === 'mojang' ? 'Mojang skin' : skin.source === 'fvc' ? 'FvC Skins' : 'Default skin'}
          </span>
        )}
        {cape && <span className="home-chip">Cape equipped</span>}
        {!skin && (failed || appearance) && (
          <span className="home-chip">{account.type === 'offline' ? 'No skin applied' : 'Skin unavailable'}</span>
        )}
      </div>

      {cape && (
        <div className="acc-d-cape">
          <CapeCanvas dataUrl={cape} scale={4} />
          <div>
            <div className="acc-d-cape-label">Cape</div>
            <div className="tiny">Shown on the back view</div>
          </div>
        </div>
      )}
    </aside>
  )
}

/** Draws the outer face of a cape texture (10x16 at 1,1 in the 64x32 layout). */
function CapeCanvas({
  dataUrl,
  scale,
  className,
  style
}: {
  dataUrl: string
  scale: number
  className?: string
  style?: CSSProperties
}): ReactNode {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (cancelled) return
      const unit = img.width / 64
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(img, unit, unit, 10 * unit, 16 * unit, 0, 0, canvas.width, canvas.height)
    }
    img.src = dataUrl
    return () => {
      cancelled = true
    }
  }, [dataUrl, scale])

  return (
    <canvas
      ref={ref}
      width={10 * scale}
      height={16 * scale}
      className={`acc-d-cape-canvas ${className ?? ''}`}
      style={style}
      aria-label="Cape"
    />
  )
}

// ============================================================== Stats

function StatsGrid({ account, stats }: { account: Account; stats: AccountStats | undefined }): ReactNode {
  const profiles = useApp((s) => s.profiles)
  const played = !!stats && stats.launches > 0
  const favorite = topProfiles(stats)[0]
  const favoriteName = favorite ? (profiles.find((p) => p.id === favorite.id)?.name ?? 'Deleted profile') : '—'

  return (
    <div className="acc-d-stats">
      <StatTile icon={Timer} label="Play time" value={played ? formatPlayTime(stats.playTimeSeconds) : '—'} />
      <StatTile icon={Rocket} label="Launches" value={played ? String(stats.launches) : '0'} />
      <StatTile icon={Clock} label="Last played" value={played ? formatRelative(stats.lastPlayed) : 'Never'} />
      <StatTile
        icon={Hourglass}
        label="Longest session"
        value={played && stats.longestSessionSeconds > 0 ? formatPlayTime(stats.longestSessionSeconds) : '—'}
      />
      <StatTile icon={Star} label="Favorite profile" value={favoriteName} />
      <StatTile icon={CalendarDays} label="Added" value={formatDate(account.addedAt)} />
    </div>
  )
}

function StatTile({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }): ReactNode {
  return (
    <div className="acc-d-stat">
      <span className="acc-d-stat-icon">
        <Icon size={16} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="acc-d-stat-label">{label}</div>
        <div className="acc-d-stat-value" title={value}>
          {value}
        </div>
      </div>
    </div>
  )
}

// ============================================================== Details

function DetailRows({
  account,
  appearance,
  failed
}: {
  account: Account
  appearance: AccountAppearance | null
  failed: boolean
}): ReactNode {
  const pushNotification = useApp((s) => s.pushNotification)
  const microsoft = account.type === 'microsoft'
  const skin = appearance?.skin

  const copyUuid = (): void => {
    void navigator.clipboard
      .writeText(account.uuid)
      .then(() => pushNotification({ type: 'success', title: 'UUID copied' }))
      .catch(() => pushNotification({ type: 'error', title: 'Could not copy UUID' }))
  }

  let skinText: ReactNode = <span className="tiny">Loading…</span>
  if (skin?.source === 'mojang') skinText = `Custom · ${skin.model === 'slim' ? 'slim' : 'classic'} arms`
  else if (skin?.source === 'fvc') {
    skinText = appearance?.shared ? 'FvC Skins · visible to other FvC players' : 'FvC Skins · only visible to you'
  } else if (skin?.source === 'default') skinText = 'Default skin'
  else if (failed || appearance) skinText = microsoft ? 'Could not load' : 'None applied'

  return (
    <section className="stack" style={{ gap: 10 }}>
      <h3 className="acc-d-section">Details</h3>
      <div className="acc-d-rows">
        <DetailRow icon={User} label="Account type">
          {microsoft ? 'Microsoft · Java Edition' : 'Offline · name only'}
        </DetailRow>
        <DetailRow icon={Globe} label="Multiplayer">
          {microsoft ? 'Online-mode servers and Realms' : 'Offline-mode servers and LAN only'}
        </DetailRow>
        <DetailRow icon={KeyRound} label="Session">
          {!microsoft ? (
            'No sign-in needed'
          ) : account.needsRelogin ? (
            <span style={{ color: 'var(--error)' }}>Expired · sign in again</span>
          ) : (
            <>
              Refreshes automatically
              {account.expiresAt && <span className="tiny"> · token valid until {formatDate(account.expiresAt, true)}</span>}
            </>
          )}
        </DetailRow>
        <DetailRow icon={Shirt} label="Skin">
          {skinText}
          {skin?.source === 'fvc' && appearance?.appliedAt && (
            <span className="tiny"> · applied {formatRelative(appearance.appliedAt)}</span>
          )}
        </DetailRow>
        {microsoft && (
          <DetailRow icon={Star} label="Cape">
            {appearance ? (appearance.capeDataUrl ? 'Equipped' : 'None') : failed ? '—' : <span className="tiny">Loading…</span>}
          </DetailRow>
        )}
        <DetailRow icon={Fingerprint} label="UUID">
          <button className="acc-d-uuid" onClick={copyUuid} title="Copy UUID">
            <span>{account.uuid}</span>
            <Copy size={13} />
          </button>
        </DetailRow>
      </div>
    </section>
  )
}

function DetailRow({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }): ReactNode {
  return (
    <div className="acc-d-row">
      <span className="acc-d-row-label">
        <Icon size={14} /> {label}
      </span>
      <span className="acc-d-row-value">{children}</span>
    </div>
  )
}

// ============================================================== Profiles

function topProfiles(stats: AccountStats | undefined): { id: string; seconds: number; launches: number }[] {
  if (!stats) return []
  return Object.entries(stats.profiles)
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => b.seconds - a.seconds || b.launches - a.launches)
}

function ProfileBreakdown({ stats }: { stats: AccountStats | undefined }): ReactNode {
  const profiles = useApp((s) => s.profiles)
  const rows = topProfiles(stats).slice(0, 5)
  const max = Math.max(1, ...rows.map((r) => r.seconds))

  return (
    <section className="stack" style={{ gap: 10 }}>
      <h3 className="acc-d-section">Most played profiles</h3>
      {rows.length === 0 ? (
        <div className="acc-d-empty">
          <Rocket size={18} />
          <span>No games played with this account yet. Launches and play time are recorded from now on.</span>
        </div>
      ) : (
        <div className="acc-d-profiles">
          {rows.map((row) => {
            const profile = profiles.find((p) => p.id === row.id)
            const Icon = profileIcon(profile?.icon ?? '')
            return (
              <div key={row.id} className="acc-d-profile">
                <span className="acc-d-profile-icon">
                  <Icon size={16} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="acc-d-profile-top">
                    <span className="acc-d-profile-name">{profile?.name ?? 'Deleted profile'}</span>
                    <span className="tiny">
                      {row.seconds >= 60 ? formatPlayTime(row.seconds) : '< 1 min'} · {row.launches}{' '}
                      {row.launches === 1 ? 'launch' : 'launches'}
                    </span>
                  </div>
                  <div className="acc-d-bar">
                    <span style={{ width: `${Math.max(4, (row.seconds / max) * 100)}%` }} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
