import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  Clock,
  Copy,
  Download,
  FolderOpen,
  Image,
  MoreVertical,
  Package,
  Pencil,
  Play,
  Plus,
  Star,
  Timer,
  Trash2,
  Upload,
  Wrench
} from 'lucide-react'
import { Button, ConfirmDialog, EmptyState, Input, Modal, Tabs } from '@/components/ui'
import { InstalledList } from '@/components/InstalledList'
import { ModBrowser } from '@/components/ModBrowser'
import { ProfileWizard } from '@/components/ProfileWizard'
import { formatPlayTime, formatRelative, useApp } from '@/store'
import { LOADER_LABELS, profileIcon } from '@/lib'
import type { ContentKind, Profile } from '@shared/types'

export function ProfilesPage(): ReactNode {
  const openProfileId = useApp((s) => s.openProfileId)
  return openProfileId ? <ProfileDetail profileId={openProfileId} /> : <ProfileGrid />
}

// ============================================================== Grid view

interface MenuState {
  profile: Profile
  x: number
  y: number
}

function ProfileGrid(): ReactNode {
  const profiles = useApp((s) => s.profiles)
  const openProfile = useApp((s) => s.openProfile)
  const selectProfile = useApp((s) => s.selectProfile)
  const navigate = useApp((s) => s.navigate)
  const pushNotification = useApp((s) => s.pushNotification)

  const [wizardOpen, setWizardOpen] = useState(false)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [renameTarget, setRenameTarget] = useState<Profile | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null)

  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
    }
  }, [menu])

  const showMenu = (e: MouseEvent, profile: Profile): void => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({
      profile,
      x: Math.min(e.clientX, window.innerWidth - 210),
      y: Math.min(e.clientY, window.innerHeight - 320)
    })
  }

  const act = async (action: () => Promise<unknown> | unknown, successMsg?: string): Promise<void> => {
    setMenu(null)
    try {
      await action()
      if (successMsg) pushNotification({ type: 'success', title: successMsg })
    } catch (err) {
      pushNotification({
        type: 'error',
        title: 'Action failed',
        body: err instanceof Error ? err.message : String(err)
      })
    }
  }

  const sorted = [...profiles].sort((a, b) => Number(b.favorite) - Number(a.favorite))

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Profiles</h1>
          <div className="subtitle">
            Each profile has its own mods, saves, configs and settings — fully isolated.
          </div>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <Button icon={Upload} onClick={() => void act(() => window.fvc.profiles.importProfile())}>
            Import
          </Button>
          <Button variant="primary" icon={Plus} onClick={() => setWizardOpen(true)}>
            New profile
          </Button>
        </div>
      </div>

      {profiles.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No profiles yet"
          hint="Create a profile to choose a Minecraft version, loader and mods."
          action={
            <Button variant="primary" icon={Plus} onClick={() => setWizardOpen(true)}>
              Create your first profile
            </Button>
          }
        />
      ) : (
        <div className="grid-cards">
          {sorted.map((profile) => {
            const Icon = profileIcon(profile.icon)
            return (
              <motion.div
                key={profile.id}
                layout
                className="card hoverable"
                style={{ padding: 18, cursor: 'pointer', position: 'relative', overflow: 'hidden' }}
                onClick={() => openProfile(profile.id)}
                onContextMenu={(e) => showMenu(e, profile)}
              >
                {profile.backgroundImage && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      backgroundImage: `linear-gradient(180deg, rgba(28,32,41,0.75), rgba(28,32,41,0.95)), url("${profile.backgroundImage}")`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center'
                    }}
                  />
                )}
                <div style={{ position: 'relative' }}>
                  <div className="row between">
                    <span className="mod-icon" style={{ width: 52, height: 52 }}>
                      <Icon size={24} />
                    </span>
                    <div className="row" style={{ gap: 4 }}>
                      {profile.favorite && (
                        <Star size={16} fill="var(--warning)" strokeWidth={0} />
                      )}
                      <Button
                        variant="subtle"
                        icon={MoreVertical}
                        onClick={(e) => showMenu(e, profile)}
                        aria-label="Profile actions"
                      />
                    </div>
                  </div>
                  <h3 style={{ marginTop: 12, fontSize: '1.02rem' }}>{profile.name}</h3>
                  <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    <span className="badge accent">{profile.minecraftVersion}</span>
                    <span className="badge">{LOADER_LABELS[profile.loader]}</span>
                  </div>
                  <div className="row" style={{ gap: 14, marginTop: 14 }}>
                    <span className="tiny row" style={{ gap: 5 }}>
                      <Clock size={12} /> {formatRelative(profile.lastPlayed)}
                    </span>
                    <span className="tiny row" style={{ gap: 5 }}>
                      <Timer size={12} /> {formatPlayTime(profile.playTimeSeconds)}
                    </span>
                  </div>
                  <Button
                    variant="primary"
                    icon={Play}
                    style={{ width: '100%', marginTop: 14 }}
                    onClick={(e) => {
                      e.stopPropagation()
                      void selectProfile(profile.id).then(() => navigate('play'))
                    }}
                  >
                    Play
                  </Button>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Context menu — portaled so its fixed coordinates resolve against the
          viewport, not the page wrapper (whose animation forms a containing block). */}
      {createPortal(
        <AnimatePresence>
        {menu && (
          <motion.div
            className="context-menu"
            style={{ left: menu.x, top: menu.y }}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.12 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => void act(() => selectProfile(menu.profile.id).then(() => navigate('play')))}>
              <Play /> Play
            </button>
            <button onClick={() => { setMenu(null); openProfile(menu.profile.id) }}>
              <Package /> Manage mods
            </button>
            <button
              onClick={() => {
                setMenu(null)
                setRenameTarget(menu.profile)
                setRenameValue(menu.profile.name)
              }}
            >
              <Pencil /> Rename
            </button>
            <button onClick={() => void act(() => window.fvc.profiles.duplicate(menu.profile.id), 'Profile duplicated')}>
              <Copy /> Duplicate
            </button>
            <button
              onClick={() =>
                void act(() =>
                  window.fvc.profiles.update(menu.profile.id, { favorite: !menu.profile.favorite })
                )
              }
            >
              <Star /> {menu.profile.favorite ? 'Unfavorite' : 'Favorite'}
            </button>
            <div className="divider" />
            <button onClick={() => void act(() => window.fvc.profiles.openFolder(menu.profile.id))}>
              <FolderOpen /> Open folder
            </button>
            <button
              onClick={() =>
                void act(async () => {
                  const path = await window.fvc.profiles.exportProfile(menu.profile.id)
                  if (path) pushNotification({ type: 'success', title: 'Profile exported', body: path })
                })
              }
            >
              <Download /> Export
            </button>
            <button onClick={() => void act(() => window.fvc.profiles.repair(menu.profile.id), 'Profile will be re-verified on next launch')}>
              <Wrench /> Repair
            </button>
            <div className="divider" />
            <button className="danger" onClick={() => { setMenu(null); setDeleteTarget(menu.profile) }}>
              <Trash2 /> Delete
            </button>
          </motion.div>
        )}
        </AnimatePresence>,
        document.body
      )}

      <ProfileWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />

      {/* Rename dialog */}
      <Modal
        open={renameTarget !== null}
        onClose={() => setRenameTarget(null)}
        title="Rename profile"
        footer={
          <>
            <Button onClick={() => setRenameTarget(null)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!renameValue.trim()}
              onClick={() =>
                void act(async () => {
                  await window.fvc.profiles.update(renameTarget!.id, { name: renameValue.trim() })
                  setRenameTarget(null)
                })
              }
            >
              Rename
            </Button>
          </>
        }
      >
        <div className="modal-body">
          <Input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Delete ${deleteTarget?.name}?`}
        body="This permanently deletes the profile including its mods, saves, configs and screenshots. This cannot be undone."
        confirmLabel="Delete forever"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() =>
          void act(async () => {
            await window.fvc.profiles.remove(deleteTarget!.id)
            setDeleteTarget(null)
          }, 'Profile deleted')
        }
      />
    </>
  )
}

// ============================================================== Detail view

function ProfileDetail({ profileId }: { profileId: string }): ReactNode {
  const profiles = useApp((s) => s.profiles)
  const openProfile = useApp((s) => s.openProfile)
  const selectProfile = useApp((s) => s.selectProfile)
  const navigate = useApp((s) => s.navigate)
  const pushNotification = useApp((s) => s.pushNotification)
  const profile = profiles.find((p) => p.id === profileId)

  const [tab, setTab] = useState('mods')
  const [mode, setMode] = useState<'installed' | 'browse'>('installed')
  const [reloadKey, setReloadKey] = useState(0)
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set())

  const kind: ContentKind = tab === 'resourcepacks' ? 'resourcepack' : tab === 'shaders' ? 'shaderpack' : 'mod'

  // Track installed project ids so the browser can show "Installed" states.
  useEffect(() => {
    if (!profile || tab === 'settings') return
    void window.fvc.content.list(profile.id, kind).then((items) => {
      setInstalledIds(new Set(items.map((i) => i.modrinthProjectId).filter(Boolean) as string[]))
    })
  }, [profile, kind, tab, reloadKey])

  if (!profile) {
    return (
      <EmptyState
        icon={Package}
        title="Profile not found"
        action={<Button onClick={() => openProfile(null)}>Back to profiles</Button>}
      />
    )
  }

  const Icon = profileIcon(profile.icon)

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row" style={{ gap: 14 }}>
        <Button variant="subtle" icon={ArrowLeft} onClick={() => openProfile(null)} aria-label="Back" />
        <span className="mod-icon" style={{ width: 58, height: 58 }}>
          <Icon size={26} />
        </span>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '1.4rem' }}>{profile.name}</h1>
          <div className="row" style={{ gap: 6, marginTop: 6 }}>
            <span className="badge accent">{profile.minecraftVersion}</span>
            <span className="badge">
              {LOADER_LABELS[profile.loader]}
              {profile.loaderVersion ? ` ${profile.loaderVersion}` : ''}
            </span>
            <span className="badge">
              <Timer size={11} /> {formatPlayTime(profile.playTimeSeconds)}
            </span>
          </div>
        </div>
        <Button icon={FolderOpen} onClick={() => void window.fvc.profiles.openFolder(profile.id)}>
          Open folder
        </Button>
        <Button
          variant="primary"
          icon={Play}
          onClick={() => void selectProfile(profile.id).then(() => navigate('play'))}
        >
          Play
        </Button>
      </div>

      <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <Tabs
          tabs={[
            { id: 'mods', label: 'Mods' },
            { id: 'resourcepacks', label: 'Resource Packs' },
            { id: 'shaders', label: 'Shader Packs' },
            { id: 'settings', label: 'Settings' }
          ]}
          active={tab}
          onChange={(t) => {
            setTab(t)
            setMode('installed')
          }}
        />
        {tab !== 'settings' && (
          <div className="tabs">
            <button className={`tab ${mode === 'installed' ? 'active' : ''}`} onClick={() => setMode('installed')}>
              {mode === 'installed' && <span className="tab-bg" />}
              Installed
            </button>
            <button className={`tab ${mode === 'browse' ? 'active' : ''}`} onClick={() => setMode('browse')}>
              {mode === 'browse' && <span className="tab-bg" />}
              Browse Modrinth
            </button>
          </div>
        )}
      </div>

      {tab === 'settings' ? (
        <ProfileSettings profile={profile} />
      ) : mode === 'installed' ? (
        <InstalledList profileId={profile.id} kind={kind} reloadKey={reloadKey} />
      ) : (
        <ModBrowser
          kind={kind}
          profile={profile}
          installedProjectIds={installedIds}
          onInstalled={() => setReloadKey((k) => k + 1)}
        />
      )}
    </div>
  )

  function ProfileSettings({ profile }: { profile: Profile }): ReactNode {
    const patch = (p: Partial<Profile>): void => {
      void window.fvc.profiles.update(profile.id, p).catch((err) =>
        pushNotification({ type: 'error', title: 'Could not save', body: String(err) })
      )
    }
    return (
      <div className="card">
        <div className="setting-row">
          <div>
            <div className="s-label">Background image</div>
            <div className="s-desc">Shown on the Play page and profile card</div>
          </div>
          <div className="s-control row" style={{ gap: 8 }}>
            {profile.backgroundImage && (
              <Button variant="subtle" onClick={() => patch({ backgroundImage: undefined })}>
                Clear
              </Button>
            )}
            <Button
              icon={Image}
              onClick={() =>
                void window.fvc.system.pickImage().then((img) => img && patch({ backgroundImage: img }))
              }
            >
              Choose image
            </Button>
          </div>
        </div>
        <div className="setting-row">
          <div>
            <div className="s-label">Java executable</div>
            <div className="s-desc">Leave empty to let the launcher manage Java automatically</div>
          </div>
          <div className="s-control row" style={{ gap: 8 }}>
            {profile.javaPath && (
              <Button variant="subtle" onClick={() => patch({ javaPath: undefined })}>
                Auto
              </Button>
            )}
            <Button
              icon={Wrench}
              onClick={() =>
                void window.fvc.java
                  .pickExecutable()
                  .then((path) => path && patch({ javaPath: path }))
                  .catch((err) =>
                    pushNotification({ type: 'error', title: 'Invalid Java', body: String(err) })
                  )
              }
            >
              {profile.javaPath ? 'Change' : 'Pick Java'}
            </Button>
          </div>
        </div>
      </div>
    )
  }
}
