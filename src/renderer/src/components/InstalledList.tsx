import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { ArrowUpCircle, Package, RefreshCw, Trash2 } from 'lucide-react'
import { Button, ConfirmDialog, EmptyState, Toggle } from '@/components/ui'
import { formatBytes, useApp } from '@/store'
import { KIND_LABELS } from '@/lib'
import type { ContentKind, InstalledContent } from '@shared/types'

export function InstalledList({
  profileId,
  kind,
  reloadKey
}: {
  profileId: string
  kind: ContentKind
  /** Bump to force a reload (e.g. after installs from the browser tab). */
  reloadKey?: number
}): ReactNode {
  const pushNotification = useApp((s) => s.pushNotification)
  const openProject = useApp((s) => s.openProject)
  const [items, setItems] = useState<InstalledContent[] | null>(null)
  const [checking, setChecking] = useState(false)
  const [updating, setUpdating] = useState<Set<string>>(new Set())
  const [removeTarget, setRemoveTarget] = useState<InstalledContent | null>(null)
  const [dependents, setDependents] = useState<string[]>([])
  const [keepConfig, setKeepConfig] = useState(true)

  const reload = useCallback(async () => {
    setItems(await window.fvc.content.list(profileId, kind))
  }, [profileId, kind])

  useEffect(() => {
    setItems(null)
    void reload()
  }, [reload, reloadKey])

  const checkUpdates = async (): Promise<void> => {
    setChecking(true)
    try {
      const checked = await window.fvc.content.checkUpdates(profileId, kind)
      setItems(checked)
      const count = checked.filter((i) => i.updateVersionId).length
      pushNotification(
        count > 0
          ? { type: 'info', title: `${count} update${count > 1 ? 's' : ''} available` }
          : { type: 'success', title: 'Everything is up to date' }
      )
    } catch (err) {
      pushNotification({
        type: 'error',
        title: 'Update check failed',
        body: err instanceof Error ? err.message : String(err)
      })
    } finally {
      setChecking(false)
    }
  }

  const applyUpdate = async (item: InstalledContent): Promise<void> => {
    setUpdating((s) => new Set(s).add(item.fileName))
    try {
      await window.fvc.content.update(profileId, kind, item.fileName)
      pushNotification({
        type: 'success',
        title: `${item.name} updated`,
        body: item.updateVersionNumber ? `Now on ${item.updateVersionNumber}.` : undefined
      })
      await reload()
    } catch (err) {
      pushNotification({
        type: 'error',
        title: `Could not update ${item.name}`,
        body: err instanceof Error ? err.message : String(err)
      })
    } finally {
      setUpdating((s) => {
        const next = new Set(s)
        next.delete(item.fileName)
        return next
      })
    }
  }

  const updateAll = async (): Promise<void> => {
    const outdated = (items ?? []).filter((i) => i.updateVersionId)
    for (const item of outdated) await applyUpdate(item)
  }

  const startRemove = async (item: InstalledContent): Promise<void> => {
    setKeepConfig(true)
    setRemoveTarget(item)
    setDependents([])
    if (kind === 'mod') {
      setDependents(await window.fvc.content.dependents(profileId, item.fileName))
    }
  }

  const confirmRemove = async (): Promise<void> => {
    if (!removeTarget) return
    try {
      await window.fvc.content.remove(profileId, kind, removeTarget.fileName, keepConfig)
      pushNotification({ type: 'success', title: `${removeTarget.name} removed` })
      await reload()
    } catch (err) {
      pushNotification({
        type: 'error',
        title: 'Remove failed',
        body: err instanceof Error ? err.message : String(err)
      })
    } finally {
      setRemoveTarget(null)
    }
  }

  const toggle = async (item: InstalledContent, enabled: boolean): Promise<void> => {
    await window.fvc.content.toggle(profileId, kind, item.fileName, enabled)
    await reload()
  }

  if (items === null) {
    return (
      <div className="empty-state">
        <span className="spinner" style={{ width: 28, height: 28, color: 'var(--accent)' }} />
      </div>
    )
  }

  const updatesAvailable = items.filter((i) => i.updateVersionId).length

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row between">
        <span className="muted" style={{ fontSize: '0.85rem' }}>
          {items.length} {items.length === 1 ? KIND_LABELS[kind].singular.toLowerCase() : KIND_LABELS[kind].plural.toLowerCase()} installed
        </span>
        <div className="row" style={{ gap: 8 }}>
          {updatesAvailable > 0 && (
            <Button variant="primary" icon={ArrowUpCircle} onClick={() => void updateAll()}>
              Update all ({updatesAvailable})
            </Button>
          )}
          <Button icon={RefreshCw} loading={checking} onClick={() => void checkUpdates()}>
            Check updates
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Package}
          title={`No ${KIND_LABELS[kind].plural.toLowerCase()} yet`}
          hint="Use the Browse tab to install content from Modrinth."
        />
      ) : (
        items.map((item) => (
          <motion.div
            key={item.fileName}
            className="card mod-row"
            style={{ alignItems: 'center', opacity: item.enabled ? 1 : 0.55 }}
            layout
          >
            {item.iconUrl ? (
              <img className="mod-icon" src={item.iconUrl} alt="" style={{ width: 44, height: 44 }} />
            ) : (
              <span className="mod-icon" style={{ width: 44, height: 44 }}>
                <Package size={18} />
              </span>
            )}
            <div
              className="mod-meta"
              style={{ cursor: item.modrinthProjectId ? 'pointer' : 'default' }}
              onClick={() => item.modrinthProjectId && openProject(item.modrinthProjectId)}
            >
              <div className="mod-title">
                {item.name}
                {item.version && <span className="author">{item.version}</span>}
                {item.updateVersionId && (
                  <span className="badge accent">Update: {item.updateVersionNumber}</span>
                )}
                {!item.enabled && <span className="badge">Disabled</span>}
              </div>
              <div className="tiny" style={{ marginTop: 3 }}>
                {item.fileName} · {formatBytes(item.fileSize)}
                {item.author ? ` · by ${item.author}` : ''}
              </div>
            </div>
            <div className="row" style={{ gap: 10 }}>
              {item.updateVersionId && (
                <Button
                  variant="primary"
                  icon={ArrowUpCircle}
                  loading={updating.has(item.fileName)}
                  onClick={() => void applyUpdate(item)}
                >
                  Update
                </Button>
              )}
              <Toggle checked={item.enabled} onChange={(v) => void toggle(item, v)} />
              <Button variant="danger" icon={Trash2} onClick={() => void startRemove(item)} aria-label="Remove" />
            </div>
          </motion.div>
        ))
      )}

      <ConfirmDialog
        open={removeTarget !== null}
        title={`Remove ${removeTarget?.name}?`}
        danger
        confirmLabel="Remove"
        onCancel={() => setRemoveTarget(null)}
        onConfirm={() => void confirmRemove()}
        body={
          <div className="stack" style={{ gap: 12 }}>
            {dependents.length > 0 && (
              <div className="badge warning" style={{ alignSelf: 'flex-start', whiteSpace: 'normal', lineHeight: 1.5 }}>
                Required by: {dependents.join(', ')}. Removing it may break those mods.
              </div>
            )}
            <p className="muted" style={{ lineHeight: 1.5 }}>
              The file will be deleted from this profile.
            </p>
            {kind === 'mod' && (
              <label className="row" style={{ gap: 10, cursor: 'pointer' }}>
                <Toggle checked={keepConfig} onChange={setKeepConfig} />
                <span style={{ fontSize: '0.86rem' }}>Keep configuration files</span>
              </label>
            )}
          </div>
        }
      />
    </div>
  )
}
