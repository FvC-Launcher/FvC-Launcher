import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowRight,
  Download,
  ExternalLink,
  Eye,
  Info,
  Layers,
  Link2,
  Search,
  Shirt,
  Trash2,
  User,
  UserCheck,
  X
} from 'lucide-react'
import { Avatar, Button, Input } from '@/components/ui'
import { SkinViewer } from '@/components/SkinViewer'
import { useApp } from '@/store'
import type { AppliedSkin, ResolvedSkin, SkinModel } from '@shared/types'

/** Remembered across navigations and restarts — the lookup itself is cheap. */
const STORAGE_KEY = 'fvc.skin.query'
const RECENT_KEY = 'fvc.skin.recent'
const RECENT_MAX = 8

function readStoredQuery(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

function readRecent(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((q): q is string => typeof q === 'string') : []
  } catch {
    return []
  }
}

function writeRecent(list: string[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list))
  } catch {
    // Storage unavailable — recents just won't persist.
  }
}

const isUrl = (q: string): boolean => /^https?:\/\//i.test(q.trim())

function shortLink(url: string): string {
  try {
    const u = new URL(url)
    const file = u.pathname.split('/').filter(Boolean).pop()
    return file ? `${u.hostname}/…/${file}` : u.hostname
  } catch {
    return url
  }
}

export function SkinPage(): ReactNode {
  const accounts = useApp((s) => s.accounts)
  const activeId = useApp((s) => s.activeAccountId)
  const navigate = useApp((s) => s.navigate)
  const pushNotification = useApp((s) => s.pushNotification)

  const [query, setQuery] = useState(readStoredQuery)
  const [recent, setRecent] = useState<string[]>(readRecent)
  const [skin, setSkin] = useState<ResolvedSkin | null>(null)
  const [model, setModel] = useState<SkinModel>('classic')
  const [showOverlay, setShowOverlay] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [applied, setApplied] = useState<AppliedSkin | null>(null)
  const [applying, setApplying] = useState(false)
  const restored = useRef(false)

  const activeAccount = accounts.find((a) => a.id === activeId) ?? null
  const isMicrosoft = activeAccount?.type === 'microsoft'
  const isOffline = activeAccount?.type === 'offline'
  const hasOffline = accounts.some((a) => a.type === 'offline')

  useEffect(() => {
    setApplied(null)
    if (!activeAccount || activeAccount.type !== 'offline') return
    let cancelled = false
    const refresh = (): void => {
      void window.fvc.skins.getApplied(activeAccount.id).then((s) => !cancelled && setApplied(s))
    }
    refresh()
    const unsubscribe = window.fvc.skins.onChanged(refresh)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [activeAccount?.id, activeAccount?.type])

  const showApplied = (s: AppliedSkin): void => {
    setSkin({
      dataUrl: s.dataUrl,
      model: s.model,
      source: 'applied',
      username: activeAccount?.username,
      textureUrl: `applied:${s.appliedAt}`
    })
    setModel(s.model)
    setError(null)
  }

  const apply = async (): Promise<void> => {
    if (!skin || !activeAccount) return
    setApplying(true)
    try {
      const result = await window.fvc.skins.apply(activeAccount.id, skin.dataUrl, model)
      setApplied(result)
      pushNotification(
        result.shared
          ? {
              type: 'success',
              title: 'Skin applied',
              body: `${activeAccount.username} will wear it on Fabric 26.2 profiles.`
            }
          : {
              type: 'warning',
              title: 'Skin applied, not shared yet',
              body: 'You will see it in game, but the skin server could not be reached, so other players can’t yet. It will retry at the next launch.'
            }
      )
    } catch (err) {
      pushNotification({
        type: 'error',
        title: 'Could not apply skin',
        body: err instanceof Error ? err.message : String(err)
      })
    } finally {
      setApplying(false)
    }
  }

  const removeApplied = async (): Promise<void> => {
    if (!activeAccount) return
    setApplying(true)
    try {
      await window.fvc.skins.remove(activeAccount.id)
      setApplied(null)
      pushNotification({ type: 'info', title: 'Skin removed', body: `${activeAccount.username} is back to the default skin.` })
    } finally {
      setApplying(false)
    }
  }

  const alreadyApplied =
    !!skin && !!applied && skin.dataUrl === applied.dataUrl && model === applied.model

  const load = async (raw: string): Promise<void> => {
    const trimmed = raw.trim()
    if (!trimmed) return
    setQuery(trimmed)
    setBusy(true)
    setError(null)
    try {
      const resolved = await window.fvc.skins.resolve(trimmed)
      setSkin(resolved)
      setModel(resolved.model)
      try {
        localStorage.setItem(STORAGE_KEY, trimmed)
      } catch {
        // Private mode / storage disabled — the preview still works.
      }
      const label = resolved.source === 'username' && resolved.username ? resolved.username : trimmed
      setRecent((prev) => {
        const next = [label, ...prev.filter((q) => q.toLowerCase() !== label.toLowerCase())].slice(0, RECENT_MAX)
        writeRecent(next)
        return next
      })
    } catch (err) {
      setSkin(null)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const forget = (q: string): void => {
    setRecent((prev) => {
      const next = prev.filter((r) => r !== q)
      writeRecent(next)
      return next
    })
  }

  // Bring back whatever was previewed the last time this page was open.
  useEffect(() => {
    if (restored.current) return
    restored.current = true
    const stored = readStoredQuery()
    if (stored) void load(stored)
  }, [])

  const sourceLabel = !skin
    ? ''
    : skin.source === 'applied'
      ? 'Currently applied'
      : skin.source === 'url'
        ? 'From link'
        : 'From Mojang'

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Skin</h1>
          <div className="subtitle">
            Preview any player’s skin or a texture link, then wear it on your offline account.
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------- Target account */}
      <div className={`skin-target ${isOffline ? '' : 'warn'}`}>
        {activeAccount ? (
          <Avatar
            username={activeAccount.type === 'microsoft' ? activeAccount.username : ''}
            size={36}
            radius={9}
          />
        ) : (
          <span className="skin-target-icon">
            <User size={18} />
          </span>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="skin-target-title">
            {isOffline ? (
              <>
                Skins apply to <strong>{activeAccount.username}</strong>
                <span className="badge">Offline</span>
              </>
            ) : isMicrosoft ? (
              <>
                <strong>{activeAccount.username}</strong> is a Microsoft account
              </>
            ) : (
              'No account selected'
            )}
          </div>
          <div className="tiny">
            {isOffline
              ? 'Shows in game on Fabric 26.2 profiles, and to other FvC Launcher players on the same server.'
              : isMicrosoft
                ? 'Microsoft accounts always use their Mojang skin — change it on minecraft.net. You can still preview skins here.'
                : 'Pick an offline account to apply skins to it.'}
          </div>
        </div>
        {!isOffline && (
          <Button icon={ExternalLink} onClick={() => navigate('accounts')}>
            {hasOffline ? 'Switch account' : 'Add offline account'}
          </Button>
        )}
      </div>

      <div className="skin-layout">
        {/* ---------------------------------------------------------- Stage */}
        <section className="skin-stage">
          <div className="skin-stage-top">
            <div className="skin-stage-seg" role="radiogroup" aria-label="Arm width">
              {(['classic', 'slim'] as const).map((m) => (
                <button
                  key={m}
                  role="radio"
                  aria-checked={model === m}
                  className={model === m ? 'active' : ''}
                  onClick={() => setModel(m)}
                >
                  {m === 'classic' ? 'Classic' : 'Slim'}
                </button>
              ))}
            </div>
            <button
              className={`pf-glass-btn lg ${showOverlay ? 'on-accent' : ''}`}
              title={showOverlay ? 'Hide outer layer' : 'Show outer layer'}
              aria-label="Toggle outer layer"
              aria-pressed={showOverlay}
              onClick={() => setShowOverlay((v) => !v)}
            >
              <Layers size={16} />
            </button>
          </div>

          <div className="skin-stage-body">
            <AnimatePresence mode="wait">
              {skin ? (
                <motion.div
                  key={skin.textureUrl}
                  className="skin-views"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22 }}
                >
                  {(['front', 'back'] as const).map((view) => (
                    <figure key={view} className={`skin-view ${view}`}>
                      <SkinViewer
                        dataUrl={skin.dataUrl}
                        model={model}
                        view={view}
                        showOverlay={showOverlay}
                        scale={9}
                      />
                      <figcaption>{view === 'front' ? 'Front' : 'Back'}</figcaption>
                    </figure>
                  ))}
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  className="skin-placeholder"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {busy ? (
                    <span className="spinner" style={{ width: 28, height: 28 }} />
                  ) : (
                    <>
                      <Shirt />
                      <span>No skin loaded yet</span>
                      <span className="tiny">Search a player or paste a skin link.</span>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            {busy && skin && <span className="spinner skin-stage-spinner" />}
          </div>

          <div className="skin-stage-foot">
            {skin ? (
              <>
                <div style={{ minWidth: 0 }}>
                  <div className="skin-stage-name" title={skin.username ?? skin.textureUrl}>
                    {skin.username ?? 'Custom skin'}
                  </div>
                  <div className="tiny">{sourceLabel}</div>
                </div>
                <div className="row" style={{ gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <span className="home-chip">{model === 'slim' ? 'Slim · Alex' : 'Classic · Steve'}</span>
                  {skin.isDefault && <span className="home-chip">Default skin</span>}
                  {alreadyApplied && (
                    <span className="home-chip skin-chip-on">
                      <UserCheck size={12} /> Wearing
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="tiny">The preview shows both sides at once.</div>
            )}
          </div>
        </section>

        {/* ------------------------------------------------------- Controls */}
        <div className="stack" style={{ gap: 14 }}>
          <div className="card skin-panel">
            <div className="skin-panel-title">
              <Search size={15} /> Find a skin
            </div>
            <form
              className="skin-search"
              onSubmit={(e) => {
                e.preventDefault()
                void load(query)
              }}
            >
              <div className="skin-search-field">
                {isUrl(query) ? <Link2 size={15} /> : <Search size={15} />}
                <Input
                  value={query}
                  placeholder="Player name or skin PNG link"
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(e) => setQuery(e.target.value)}
                  style={{ paddingLeft: 36 }}
                />
              </div>
              <Button variant="primary" type="submit" icon={Eye} loading={busy} disabled={!query.trim()}>
                Preview
              </Button>
            </form>
            <div className="skin-hint tiny">
              {isUrl(query) ? (
                <>
                  <Link2 size={12} /> Reads the texture straight from that link — pick the arm width on
                  the stage
                </>
              ) : (
                <>
                  <Download size={12} /> Looks the name up on Mojang
                </>
              )}
            </div>
            {error && (
              <div className="skin-error">
                <AlertTriangle size={14} /> {error}
              </div>
            )}

            {recent.length > 0 && (
              <>
                <div className="skin-subtitle">Recent</div>
                <div className="skin-recent">
                  {recent.map((q) => (
                    <span key={q} className="skin-recent-chip">
                      <button onClick={() => void load(q)} disabled={busy} title={q}>
                        {isUrl(q) ? (
                          <span className="skin-recent-link">
                            <Link2 size={12} />
                          </span>
                        ) : (
                          <Avatar username={q} size={20} radius={5} />
                        )}
                        <span className="skin-recent-label">{isUrl(q) ? shortLink(q) : q}</span>
                      </button>
                      <button
                        className="skin-recent-x"
                        onClick={() => forget(q)}
                        title="Remove from recent"
                        aria-label={`Remove ${q} from recent`}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="card skin-panel">
            <div className="skin-panel-title">
              <Shirt size={15} /> Wear it
            </div>
            {isOffline ? (
              <>
                <div className="skin-compare">
                  <SkinSwatch label="Now" dataUrl={applied?.dataUrl} model={applied?.model} />
                  <ArrowRight size={18} className="skin-compare-arrow" />
                  <SkinSwatch
                    label="Preview"
                    dataUrl={skin?.dataUrl}
                    model={model}
                    highlight={!!skin && !alreadyApplied}
                  />
                </div>
                <p className="tiny" style={{ lineHeight: 1.5, marginTop: 12 }}>
                  {applied ? (
                    <>
                      <strong>{activeAccount.username}</strong> is wearing a custom skin
                      {applied.shared
                        ? ', visible to other FvC Launcher players.'
                        : ' that only you can see for now.'}
                    </>
                  ) : (
                    <>
                      <strong>{activeAccount.username}</strong> uses the default skin.
                    </>
                  )}
                </p>
                <Button
                  variant="primary"
                  icon={Shirt}
                  className="skin-apply"
                  loading={applying}
                  disabled={!skin || alreadyApplied}
                  onClick={() => void apply()}
                >
                  {alreadyApplied ? 'Already wearing this' : `Apply to ${activeAccount.username}`}
                </Button>
                {applied && (
                  <div className="row" style={{ gap: 8, marginTop: 8 }}>
                    <Button icon={UserCheck} style={{ flex: 1 }} onClick={() => showApplied(applied)}>
                      Show current
                    </Button>
                    <Button
                      variant="danger"
                      icon={Trash2}
                      disabled={applying}
                      onClick={() => void removeApplied()}
                    >
                      Remove
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="skin-locked">
                <Info size={16} />
                <span className="tiny">
                  {hasOffline
                    ? 'Select an offline account on the Accounts page to apply a skin to it.'
                    : 'There is no offline account yet — add one on the Accounts page.'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function SkinSwatch({
  label,
  dataUrl,
  model,
  highlight
}: {
  label: string
  dataUrl?: string
  model?: SkinModel
  highlight?: boolean
}): ReactNode {
  return (
    <div className={`skin-swatch ${highlight ? 'highlight' : ''}`}>
      <div className="skin-swatch-body">
        {dataUrl && model ? (
          <SkinViewer dataUrl={dataUrl} model={model} scale={3} />
        ) : (
          <User size={26} strokeWidth={1.5} />
        )}
      </div>
      <span>{label}</span>
    </div>
  )
}
