import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, Compass, Download, ExternalLink, RefreshCw, Star } from 'lucide-react'
import { Button, EmptyState, Modal } from '@/components/ui'
import { useApp } from '@/store'
import { LOADER_LABELS } from '@/lib'
import type { CommunityPack } from '@shared/types'

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export function CommunityPacksModal({
  open,
  onClose
}: {
  open: boolean
  onClose: () => void
}): ReactNode {
  const pushNotification = useApp((s) => s.pushNotification)
  const [packs, setPacks] = useState<CommunityPack[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [installing, setInstalling] = useState<string | null>(null)

  const load = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      setPacks(await window.fvc.modpacks.community())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open && packs === null && !loading) void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const install = async (pack: CommunityPack): Promise<void> => {
    setInstalling(pack.repo)
    try {
      await window.fvc.profiles.importFromGithub(pack.repo)
    } catch (err) {
      pushNotification({
        type: 'error',
        title: `Could not install ${pack.name}`,
        body: err instanceof Error ? err.message : String(err)
      })
    } finally {
      setInstalling(null)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => installing === null && onClose()}
      title="Community modpacks"
      wide
      footer={
        <>
          <Button icon={RefreshCw} loading={loading} onClick={() => void load()}>
            Refresh
          </Button>
          <Button variant="primary" disabled={installing !== null} onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div className="modal-body">
        <div className="warning-banner">
          <AlertTriangle size={18} />
          <span>
            BE CAREFUL, THESE ARE COMMUNITY MADE MODPACKS THAT COULD CONTAIN HARMFUL CODE INSIDE.
            DOWNLOAD AT YOUR OWN RISK. FvC Client is not responsible for any damage that may
            happen.
          </span>
        </div>

        {loading && packs === null ? (
          <div className="row" style={{ justifyContent: 'center', padding: 40, gap: 10 }}>
            <span className="spinner" />
            <span className="muted">Looking for packs on GitHub…</span>
          </div>
        ) : error ? (
          <EmptyState
            icon={AlertTriangle}
            title="Could not load community packs"
            hint={error}
            action={<Button onClick={() => void load()}>Try again</Button>}
          />
        ) : !packs || packs.length === 0 ? (
          <EmptyState
            icon={Compass}
            title="No community packs yet"
            hint="Packs appear here when a GitHub repo is tagged fvc-modpack and has a release with a .fvcpack attached."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {packs.map((pack) => (
              <div key={pack.repo} className="card mod-row">
                <span className="mod-icon">
                  <Compass size={24} />
                </span>
                <div className="mod-meta">
                  <div className="mod-title">
                    {pack.name}
                    <span className="author">by {pack.author}</span>
                  </div>
                  {pack.description && <div className="mod-desc">{pack.description}</div>}
                  <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    <span className="badge accent">{pack.version}</span>
                    {pack.minecraftVersion && (
                      <span className="badge">Minecraft {pack.minecraftVersion}</span>
                    )}
                    <span className="badge">
                      {pack.loader ? LOADER_LABELS[pack.loader] : 'Unknown loader'}
                    </span>
                    <span className="badge">{formatSize(pack.sizeBytes)}</span>
                    <span className="badge">
                      <Star size={11} /> {pack.stars}
                    </span>
                  </div>
                </div>
                <div className="row" style={{ gap: 8, alignSelf: 'center' }}>
                  <Button
                    icon={ExternalLink}
                    aria-label="Open on GitHub"
                    title={pack.url}
                    onClick={() => window.fvc.system.openExternal(pack.url)}
                  />
                  <Button
                    variant="primary"
                    icon={Download}
                    loading={installing === pack.repo}
                    disabled={installing !== null}
                    onClick={() => void install(pack)}
                  >
                    Download
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
