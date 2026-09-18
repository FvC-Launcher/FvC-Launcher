import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  Box,
  Clock,
  Compass,
  Code,
  Copy,
  Download,
  FolderOpen,
  Github,
  HardDrive,
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
import { Button, ConfirmDialog, EmptyState, Field, Input, Modal, Tabs, Toggle } from '@/components/ui'
import { InstalledList } from '@/components/InstalledList'
import { ModBrowser } from '@/components/ModBrowser'
import { ProfileWizard } from '@/components/ProfileWizard'
import { formatPlayTime, formatRelative, useApp } from '@/store'
import { CommunityPacksModal } from '@/components/CommunityPacksModal'
import { LOADER_LABELS, profileIcon } from '@/lib'
import type { ContentKind, Profile, ProfileExportMode } from '@shared/types'

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
  const [importOpen, setImportOpen] = useState(false)
  const [browseOpen, setBrowseOpen] = useState(false)
  const [importRepo, setImportRepo] = useState<string | null>(null) // non-null = online step
  const [importBusy, setImportBusy] = useState(false)
  const [exportTarget, setExportTarget] = useState<Profile | null>(null)
  // Set when one of the GitHub export buttons was picked; shows the repo step.
  const [githubMode, setGithubMode] = useState<ProfileExportMode | null>(null)
  const [githubRepo, setGithubRepo] = useState('')
  const [githubRemoveOld, setGithubRemoveOld] = useState(true)

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

  const closeImport = (): void => {
    if (importBusy) return
    setImportOpen(false)
    setImportRepo(null)
  }

  const runManualImport = async (): Promise<void> => {
    closeImport()
    await act(async () => {
      const imported = await window.fvc.profiles.importProfile()
      if (imported?.packSource) {
        pushNotification({
          type: 'info',
          title: `${imported.name} imported`,
          body: `Auto-updates from github.com/${imported.packSource.repo}. The latest release is fetched when you press Play.`
        })
      }
    })
  }

  const runOnlineImport = async (): Promise<void> => {
    const repo = importRepo?.trim()
    if (!repo) return
    setImportBusy(true)
    try {
      await window.fvc.profiles.importFromGithub(repo)
      setImportOpen(false)
      setImportRepo(null)
    } catch (err) {
      // Keep the dialog open so the link can be corrected.
      pushNotification({
        type: 'error',
        title: 'Import failed',
        body: err instanceof Error ? err.message : String(err)
      })
    } finally {
      setImportBusy(false)
    }
  }

  const closeExport = (): void => {
    setExportTarget(null)
    setGithubMode(null)
  }

  const runExport = async (
    mode: ProfileExportMode,
    github?: { repo: string; removeOld: boolean }
  ): Promise<void> => {
    const target = exportTarget
    if (!target) return
    closeExport()
    await act(async () => {
      const path = await window.fvc.profiles.exportProfile(target.id, mode, github)
      if (path) pushNotification({ type: 'success', title: 'Profile exported', body: path })
    })
  }

  const pickGithub = (mode: ProfileExportMode): void => {
    setGithubMode(mode)
    setGithubRepo(exportTarget?.packSource?.repo ?? '')
    setGithubRemoveOld(exportTarget?.packSource?.removeOld ?? true)
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
          <Button icon={Compass} onClick={() => setBrowseOpen(true)}>
            Browse Modpacks
          </Button>
          <Button icon={Upload} onClick={() => { setImportRepo(null); setImportOpen(true) }}>
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
                    {profile.packSource && (
                      <span
                        className="badge"
                        title={`Auto-updates from github.com/${profile.packSource.repo}${profile.packSource.installedTag ? ` · ${profile.packSource.installedTag}` : ''}`}
                      >
                        <Github size={11} /> Auto-update
                      </span>
                    )}
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
            <button onClick={() => { setMenu(null); setExportTarget(menu.profile) }}>
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

      <CommunityPacksModal open={browseOpen} onClose={() => setBrowseOpen(false)} />

      {/* Import dialog */}
      <Modal
        open={importOpen}
        onClose={closeImport}
        title={importRepo !== null ? 'Import from GitHub' : 'How do you want to import?'}
        footer={
          importRepo !== null ? (
            <>
              <Button disabled={importBusy} onClick={() => setImportRepo(null)}>
                Back
              </Button>
              <Button
                variant="primary"
                icon={Github}
                loading={importBusy}
                disabled={!importRepo.trim() || importBusy}
                onClick={() => void runOnlineImport()}
              >
                Import
              </Button>
            </>
          ) : undefined
        }
      >
        <div className="modal-body">
          {importRepo !== null ? (
            <>
              <Field label="GitHub repository link">
                <Input
                  autoFocus
                  placeholder="https://github.com/owner/repo"
                  value={importRepo}
                  disabled={importBusy}
                  onChange={(e) => setImportRepo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void runOnlineImport()
                  }}
                />
              </Field>
              <div className="tiny">
                The latest release of this repository is downloaded and imported as a new profile.
                Future releases install automatically when you press Play.
              </div>
            </>
          ) : (
            <div className="export-choices">
              <button className="export-choice" onClick={() => void runManualImport()}>
                <span className="export-choice-icon"><HardDrive size={30} /></span>
                <span className="export-choice-title">Manual Import</span>
                <span className="export-choice-desc">Import a .fvcpack file from this computer</span>
              </button>
              <button className="export-choice" onClick={() => setImportRepo('')}>
                <span className="export-choice-icon"><Github size={30} /></span>
                <span className="export-choice-title">Online Import</span>
                <span className="export-choice-desc">Paste a GitHub repo link to download the pack</span>
              </button>
            </div>
          )}
        </div>
      </Modal>

      {/* Export dialog */}
      <Modal
        open={exportTarget !== null}
        onClose={closeExport}
        title={githubMode ? 'Link a GitHub repository' : 'What files do you want to export?'}
        footer={
          githubMode ? (
            <>
              <Button onClick={() => setGithubMode(null)}>Back</Button>
              <Button
                variant="primary"
                icon={Github}
                disabled={!githubRepo.trim()}
                onClick={() =>
                  void runExport(githubMode, { repo: githubRepo.trim(), removeOld: githubRemoveOld })
                }
              >
                Export
              </Button>
            </>
          ) : undefined
        }
      >
        <div className="modal-body">
          {githubMode ? (
            <>
              <Field label="GitHub repository link">
                <Input
                  autoFocus
                  placeholder="https://github.com/owner/repo"
                  value={githubRepo}
                  onChange={(e) => setGithubRepo(e.target.value)}
                />
              </Field>
              <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>
                    Remove mods that are no longer in the pack
                  </div>
                  <div className="tiny">Mods players added themselves are never touched.</div>
                </div>
                <Toggle checked={githubRemoveOld} onChange={setGithubRemoveOld} />
              </div>
              <div className="tiny">
                After exporting, create a new release in this repository and attach the .fvcpack
                file. Players get it automatically the next time they press Play.
                {githubMode === 'mods' ? ' Only the mods folder is included.' : ''}
              </div>
            </>
          ) : (
            <div className="export-choices">
              <button className="export-choice" onClick={() => void runExport('mods')}>
                <span className="export-choice-icon"><Code size={30} /></span>
                <span className="export-choice-title">Only Mods</span>
                <span className="export-choice-desc">
                  Will not export texture packs, settings or configs
                </span>
              </button>
              <button className="export-choice" onClick={() => void runExport('everything')}>
                <span className="export-choice-icon"><Box size={30} /></span>
                <span className="export-choice-title">Everything</span>
                <span className="export-choice-desc">
                  Will export everything: mods, texture packs, settings etc.
                </span>
              </button>
              <button className="export-choice" onClick={() => pickGithub('mods')}>
                <span className="export-choice-icon"><Github size={30} /></span>
                <span className="export-choice-title">GitHub · Only Mods</span>
                <span className="export-choice-desc">
                  Players automatically get new mods from your GitHub releases
                </span>
              </button>
              <button className="export-choice" onClick={() => pickGithub('everything')}>
                <span className="export-choice-icon"><Github size={30} /></span>
                <span className="export-choice-title">GitHub · Everything</span>
                <span className="export-choice-desc">
                  Players automatically get mods, texture packs and settings from your releases
                </span>
              </button>
            </div>
          )}
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
            {profile.packSource && (
              <span
                className="badge"
                title={`Auto-updates from github.com/${profile.packSource.repo}`}
              >
                <Github size={11} /> {profile.packSource.installedTag ?? 'Auto-update'}
              </span>
            )}
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
