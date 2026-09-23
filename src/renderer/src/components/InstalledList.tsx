import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUpCircle, Package, RefreshCw, Search, Trash2, X } from 'lucide-react'
import { Button, ConfirmDialog, EmptyState, Toggle } from '@/components/ui'
import { formatBytes, useApp } from '@/store'
import { KIND_LABELS } from '@/lib'
import type { ContentKind, InstalledContent } from '@shared/types'

type Filter = 'all' | 'enabled' | 'disabled' | 'updates'

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
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const reload = useCallback(async () => {
    setItems(await window.fvc.content.list(profileId, kind))
  }, [profileId, kind])

  useEffect(() => {
    setItems(null)
    setQuery('')
    setFilter('all')
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
      if (count > 0) setFilter('updates')
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
      <div className="il-list">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="mb-skeleton list" style={{ height: 68 }} />
        ))}
      </div>
    )
  }

  const plural = KIND_LABELS[kind].plural.toLowerCase()
  const counts = {
    all: items.length,
    enabled: items.filter((i) => i.enabled).length,
    disabled: items.filter((i) => !i.enabled).length,
    updates: items.filter((i) => i.updateVersionId).length
  }
  const needle = query.trim().toLowerCase()
  const shown = items.filter((i) => {
    if (filter === 'enabled' && !i.enabled) return false
    if (filter === 'disabled' && i.enabled) return false
    if (filter === 'updates' && !i.updateVersionId) return false
    return (
      !needle ||
      (i.name ?? '').toLowerCase().includes(needle) ||
      i.fileName.toLowerCase().includes(needle) ||
      (i.author ?? '').toLowerCase().includes(needle)
    )
  })
  const totalSize = items.reduce((sum, i) => sum + i.fileSize, 0)

  return (
    <div className="stack" style={{ gap: 12 }}>
      {items.length === 0 ? (
        <EmptyState
          icon={Package}
          title={`No ${plural} yet`}
          hint={`Switch to Browse Modrinth to install ${plural} into this profile.`}
        />
      ) : (
        <>
          <div className="il-bar">
            <div className="il-stats">
              <span>
                <strong>{counts.all}</strong> {counts.all === 1 ? KIND_LABELS[kind].singular.toLowerCase() : plural}
              </span>
              <span className="tiny">{formatBytes(totalSize)}</span>
              {counts.updates > 0 && <span className="il-update-pill">{counts.updates} to update</span>}
            </div>
            <div className="row" style={{ gap: 8 }}>
              {counts.updates > 0 && (
                <Button variant="primary" icon={ArrowUpCircle} onClick={() => void updateAll()}>
                  Update all
                </Button>
              )}
              <Button icon={RefreshCw} loading={checking} onClick={() => void checkUpdates()}>
                Check for updates
              </Button>
            </div>
          </div>

          <div className="il-tools">
            <div className="pf-search il-search">
              <Search size={15} />
              <input
                className="input"
                placeholder={`Filter ${plural}…`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ paddingLeft: 36, paddingRight: query ? 34 : undefined }}
              />
              {query && (
                <button className="mb-clear" onClick={() => setQuery('')} title="Clear">
                  <X size={13} />
                </button>
              )}
            </div>
            <div className="segmented">
              {(['all', 'enabled', 'disabled', 'updates'] as Filter[]).map((f) => (
                <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
                  {f === 'all' ? 'All' : f === 'enabled' ? 'Enabled' : f === 'disabled' ? 'Disabled' : 'Updates'}
                  <span className="il-count">{counts[f]}</span>
                </button>
              ))}
            </div>
          </div>

          {shown.length === 0 ? (
            <div className="card il-empty tiny">Nothing matches this filter.</div>
          ) : (
            <div className="il-list">
              <AnimatePresence initial={false}>
                {shown.map((item) => (
                  <motion.div
                    key={item.fileName}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.18 }}
                    className={`il-row ${item.enabled ? '' : 'disabled'} ${item.updateVersionId ? 'has-update' : ''}`}
                  >
                    {item.iconUrl ? (
                      <img className="mod-icon" src={item.iconUrl} alt="" style={{ width: 44, height: 44 }} />
                    ) : (
                      <span className="mod-icon" style={{ width: 44, height: 44 }}>
                        <Package size={18} />
                      </span>
                    )}
                    <div
                      className={`il-main ${item.modrinthProjectId ? 'link' : ''}`}
                      onClick={() => item.modrinthProjectId && openProject(item.modrinthProjectId)}
                      title={item.modrinthProjectId ? 'Open on Modrinth' : undefined}
                    >
                      <div className="il-title">
                        <span className="mb-ellipsis">{item.name ?? item.fileName}</span>
                        {item.version && <span className="il-version">{item.version}</span>}
                        {!item.enabled && <span className="badge">Disabled</span>}
                      </div>
                      <div className="il-meta">
                        <span className="mb-ellipsis il-file" title={item.fileName}>
                          {item.fileName}
                        </span>
                        <span>{formatBytes(item.fileSize)}</span>
                        {item.author && <span className="mb-ellipsis">by {item.author}</span>}
                      </div>
                    </div>
                    {item.updateVersionId && (
                      <Button
                        variant="primary"
                        className="btn-sm"
                        icon={ArrowUpCircle}
                        loading={updating.has(item.fileName)}
                        onClick={() => void applyUpdate(item)}
                        title={`Update to ${item.updateVersionNumber}`}
                      >
                        {item.updateVersionNumber ?? 'Update'}
                      </Button>
                    )}
                    <Toggle checked={item.enabled} onChange={(v) => void toggle(item, v)} />
                    <Button
                      variant="subtle"
                      className="il-remove"
                      icon={Trash2}
                      onClick={() => void startRemove(item)}
                      aria-label={`Remove ${item.name ?? item.fileName}`}
                      title="Remove"
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </>
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
