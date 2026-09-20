import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  Download,
  ExternalLink,
  Eye,
  HardHat,
  Link2,
  RotateCw,
  Search,
  Shirt,
  Wrench
} from 'lucide-react'
import { Button, Input, Toggle } from '@/components/ui'
import { SkinViewer } from '@/components/SkinViewer'
import { useApp } from '@/store'
import type { ResolvedSkin, SkinModel } from '@shared/types'

/** Remembered across navigations and restarts — the lookup itself is cheap. */
const STORAGE_KEY = 'fvc.skin.query'

function readStoredQuery(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function SkinPage(): ReactNode {
  const accounts = useApp((s) => s.accounts)
  const activeId = useApp((s) => s.activeAccountId)
  const navigate = useApp((s) => s.navigate)

  const [query, setQuery] = useState(readStoredQuery)
  const [skin, setSkin] = useState<ResolvedSkin | null>(null)
  const [model, setModel] = useState<SkinModel>('classic')
  const [view, setView] = useState<'front' | 'back'>('front')
  const [showOverlay, setShowOverlay] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const restored = useRef(false)

  const activeAccount = accounts.find((a) => a.id === activeId) ?? null
  const isMicrosoft = activeAccount?.type === 'microsoft'
  const hasOffline = accounts.some((a) => a.type === 'offline')

  const load = async (raw: string): Promise<void> => {
    const trimmed = raw.trim()
    if (!trimmed) return
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
    } catch (err) {
      setSkin(null)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  // Bring back whatever was previewed the last time this page was open.
  useEffect(() => {
    if (restored.current) return
    restored.current = true
    const stored = readStoredQuery()
    if (stored) void load(stored)
  }, [])

  const looksLikeUrl = /^https?:\/\//i.test(query.trim())

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Skin</h1>
          <div className="subtitle">
            Preview any Minecraft skin from a player name or a direct texture link.
          </div>
        </div>
      </div>

      <div className="warning-banner" style={{ marginBottom: 16 }}>
        <AlertTriangle size={16} />
        <div>
          This feature is only available for <strong>Offline accounts</strong> — not Microsoft
          accounts. A Microsoft account always loads its skin from its Mojang profile, so change it
          on minecraft.net instead.
          {isMicrosoft && (
            <>
              {' '}
              The active account <strong>{activeAccount?.username}</strong> is a Microsoft account,
              so nothing set here would apply to it.
            </>
          )}
        </div>
      </div>

      <div className="skin-layout">
        {/* ------------------------------------------------------- Preview */}
        <div className="card skin-stage">
          <div className="skin-stage-body">
            {skin ? (
              <motion.div
                key={`${skin.textureUrl}-${view}-${model}-${showOverlay}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                <SkinViewer
                  dataUrl={skin.dataUrl}
                  model={model}
                  view={view}
                  showOverlay={showOverlay}
                />
              </motion.div>
            ) : (
              <div className="skin-placeholder">
                {busy ? (
                  <span
                    className="spinner"
                    style={{ width: 26, height: 26, color: 'var(--accent)' }}
                  />
                ) : (
                  <>
                    <Shirt />
                    <span className="tiny">No skin loaded yet</span>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="skin-stage-footer">
            <div>
              {skin ? (
                <>
                  <div className="mod-title" style={{ gap: 8 }}>
                    {skin.username ?? 'Custom skin'}
                    <span className="badge">
                      {model === 'slim' ? 'Slim (Alex)' : 'Classic (Steve)'}
                    </span>
                    {skin.isDefault && <span className="badge warning">Default skin</span>}
                  </div>
                  <div className="tiny" style={{ marginTop: 3 }}>
                    {view === 'front' ? 'Front view' : 'Back view'} ·{' '}
                    {skin.source === 'url' ? 'from link' : 'from Mojang'}
                  </div>
                </>
              ) : (
                <div className="tiny">Search a player or paste a skin link to see it here.</div>
              )}
            </div>
            <Button
              icon={RotateCw}
              disabled={!skin}
              onClick={() => setView((v) => (v === 'front' ? 'back' : 'front'))}
            >
              Turn around
            </Button>
          </div>
        </div>

        {/* ------------------------------------------------------ Controls */}
        <div className="stack" style={{ gap: 14 }}>
          <div className="card skin-panel">
            <div className="skin-panel-title">
              <Search size={15} /> Skin source
            </div>
            <p className="tiny" style={{ lineHeight: 1.5 }}>
              Paste a direct link to a 64×64 skin PNG, or type the name of the player whose skin you
              want.
            </p>
            <form
              className="row"
              style={{ gap: 8, marginTop: 12 }}
              onSubmit={(e) => {
                e.preventDefault()
                void load(query)
              }}
            >
              <Input
                value={query}
                placeholder="https://…/skin.png   or   Notch"
                spellCheck={false}
                autoComplete="off"
                onChange={(e) => setQuery(e.target.value)}
              />
              <Button variant="primary" type="submit" icon={Eye} loading={busy}>
                Preview
              </Button>
            </form>
            <div className="skin-hint tiny">
              {looksLikeUrl ? (
                <>
                  <Link2 size={12} /> Reads the texture straight from that link
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
          </div>

          <div className="card skin-panel">
            <div className="skin-panel-title">
              <HardHat size={15} /> Model
            </div>
            <p className="tiny" style={{ lineHeight: 1.5 }}>
              A skin loaded from a link carries no model info, so pick the arm width yourself.
            </p>
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <Button
                variant={model === 'classic' ? 'primary' : 'outline'}
                onClick={() => setModel('classic')}
              >
                Classic
              </Button>
              <Button
                variant={model === 'slim' ? 'primary' : 'outline'}
                onClick={() => setModel('slim')}
              >
                Slim
              </Button>
            </div>
            <div className="row between" style={{ marginTop: 14 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>Outer layer</div>
                <div className="tiny">Hat, jacket, sleeves and trouser overlays.</div>
              </div>
              <Toggle checked={showOverlay} onChange={setShowOverlay} />
            </div>
          </div>

          <div className="card skin-panel">
            <div className="skin-panel-title">
              <Shirt size={15} /> Apply
            </div>
            <p className="tiny" style={{ lineHeight: 1.5 }}>
              {hasOffline
                ? 'Applying a skin to an offline session is not wired up yet.'
                : 'There is no offline account yet — add one on the Accounts page.'}
            </p>
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <Button variant="primary" icon={Shirt} disabled title="Not available yet">
                Apply to account
              </Button>
              {!hasOffline && (
                <Button icon={ExternalLink} onClick={() => navigate('accounts')}>
                  Accounts
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="dev-note">
        <Wrench size={15} />
        <div>
          <strong>Still in development.</strong> This page is only a placeholder for now — skins can
          be looked up and previewed, but applying one to an account does nothing yet.
        </div>
      </div>
    </>
  )
}
