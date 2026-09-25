import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  Box,
  CalendarDays,
  Clock,
  Compass,
  Code,
  Coffee,
  Copy,
  Download,
  FolderOpen,
  Github,
  HardDrive,
  Image,
  ImagePlus,
  MemoryStick,
  MoreVertical,
  Package,
  Pencil,
  Play,
  Plus,
  Search,
  Shapes,
  SlidersHorizontal,
  Sparkles,
  Star,
  Timer,
  Trash2,
  Wrench,
  X,
  type LucideIcon
} from 'lucide-react'
import { Button, ConfirmDialog, EmptyState, Field, Input, Modal, Tabs, Toggle } from '@/components/ui'
import { InstalledList } from '@/components/InstalledList'
import { ModBrowser } from '@/components/ModBrowser'
import { ProfileWizard } from '@/components/ProfileWizard'
import { formatPlayTime, formatRelative, useApp } from '@/store'
import { ProfileCover } from '@/components/ProfileCover'
import { ProfileIcon, ProfileIconPicker, useUploadIcon } from '@/components/ProfileIcon'
import { LOADER_LABELS, PREPARING_PHASES } from '@/lib'
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

const SORTS = {
  recent: {
    label: 'Recent',
    compare: (a: Profile, b: Profile) =>
      (b.lastPlayed ?? '').localeCompare(a.lastPlayed ?? '') || b.createdAt.localeCompare(a.createdAt)
  },
  name: {
    label: 'Name',
    compare: (a: Profile, b: Profile) => a.name.localeCompare(b.name, undefined, { numeric: true })
  },
  playtime: {
    label: 'Play time',
    compare: (a: Profile, b: Profile) => (b.playTimeSeconds || 0) - (a.playTimeSeconds || 0)
  }
} satisfies Record<string, { label: string; compare: (a: Profile, b: Profile) => number }>

type SortId = keyof typeof SORTS

const SORT_STORAGE_KEY = 'fvc.profiles.sort'

function readStoredSort(): SortId {
  try {
    const stored = localStorage.getItem(SORT_STORAGE_KEY)
    return stored && stored in SORTS ? (stored as SortId) : 'recent'
  } catch {
    return 'recent'
  }
}

function ProfileGrid(): ReactNode {
  const profiles = useApp((s) => s.profiles)
  const launches = useApp((s) => s.launches)
  const selectedProfileId = useApp((s) => s.selectedProfileId)
  const openProfile = useApp((s) => s.openProfile)
  const selectProfile = useApp((s) => s.selectProfile)
  const navigate = useApp((s) => s.navigate)
  const pushNotification = useApp((s) => s.pushNotification)

  const [query, setQuery] = useState('')
  const [sort, setSortState] = useState<SortId>(readStoredSort)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [renameTarget, setRenameTarget] = useState<Profile | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null)
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

  const setSort = (next: SortId): void => {
    setSortState(next)
    try {
      localStorage.setItem(SORT_STORAGE_KEY, next)
    } catch {
      // Storage unavailable — the choice just won't persist.
    }
  }

  const needle = query.trim().toLowerCase()
  const visible = profiles
    .filter(
      (p) =>
        !needle ||
        p.name.toLowerCase().includes(needle) ||
        p.minecraftVersion.toLowerCase().includes(needle) ||
        LOADER_LABELS[p.loader].toLowerCase().includes(needle)
    )
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || SORTS[sort].compare(a, b))

  const totalPlaySeconds = profiles.reduce((sum, p) => sum + (p.playTimeSeconds || 0), 0)

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
          <Button variant="primary" icon={Plus} onClick={() => setWizardOpen(true)}>
            New profile
          </Button>
        </div>
      </div>

      {profiles.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No profiles yet"
          hint="Create a profile, install a modpack, or import one you exported before."
          action={
            <Button variant="primary" icon={Plus} onClick={() => setWizardOpen(true)}>
              Create your first profile
            </Button>
          }
        />
      ) : (
        <div className="stack" style={{ gap: 16 }}>
          <div className="pf-toolbar">
            <div className="pf-search">
              <Search size={16} />
              <Input
                placeholder="Search profiles…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ paddingLeft: 38, paddingRight: query ? 36 : undefined }}
              />
              {query && (
                <button className="mb-clear" onClick={() => setQuery('')} title="Clear search">
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="pf-summary tiny">
              {profiles.length} {profiles.length === 1 ? 'profile' : 'profiles'}
              {totalPlaySeconds >= 60 && ` · ${formatPlayTime(totalPlaySeconds)} played`}
            </div>
            <div className="segmented" role="radiogroup" aria-label="Sort profiles">
              {(Object.keys(SORTS) as SortId[]).map((id) => (
                <button
                  key={id}
                  role="radio"
                  aria-checked={sort === id}
                  className={sort === id ? 'active' : ''}
                  onClick={() => setSort(id)}
                >
                  {SORTS[id].label}
                </button>
              ))}
            </div>
          </div>

          {visible.length === 0 ? (
            <EmptyState
              icon={Search}
              title={`No profiles match “${query.trim()}”`}
              hint="Try a profile name, Minecraft version or loader."
              action={<Button onClick={() => setQuery('')}>Clear search</Button>}
            />
          ) : (
            <div className="pf-grid">
              {visible.map((profile) => {
                const mine = launches.filter((l) => l.profileId === profile.id)
                const running = mine.some((l) => l.phase === 'running')
                const preparing = mine.some((l) => PREPARING_PHASES.includes(l.phase))
                const selected = profile.id === selectedProfileId
                return (
                  <motion.div
                    key={profile.id}
                    layout
                    role="button"
                    tabIndex={0}
                    className={`pf-card ${selected ? 'selected' : ''}`}
                    onClick={() => openProfile(profile.id)}
                    onKeyDown={(e) => {
                      if (e.target === e.currentTarget && e.key === 'Enter') openProfile(profile.id)
                    }}
                    onContextMenu={(e) => showMenu(e, profile)}
                  >
                    <div className="pf-card-cover">
                      <ProfileCover profile={profile} />
                      <div className="pf-card-top">
                        {running ? (
                          <span className="pf-status running">
                            <span className="dot" /> Running
                          </span>
                        ) : preparing ? (
                          <span className="pf-status">
                            <span className="spinner" /> Launching
                          </span>
                        ) : selected ? (
                          <span className="pf-status">Selected</span>
                        ) : (
                          <span />
                        )}
                        <div className="pf-card-tools">
                          <button
                            className={`pf-glass-btn ${profile.favorite ? 'on' : ''}`}
                            title={profile.favorite ? 'Unfavorite' : 'Favorite'}
                            aria-label={profile.favorite ? 'Unfavorite' : 'Favorite'}
                            onClick={(e) => {
                              e.stopPropagation()
                              void act(() =>
                                window.fvc.profiles.update(profile.id, { favorite: !profile.favorite })
                              )
                            }}
                          >
                            <Star size={15} fill={profile.favorite ? 'currentColor' : 'none'} />
                          </button>
                          <button
                            className="pf-glass-btn"
                            title="Profile actions"
                            aria-label="Profile actions"
                            onClick={(e) => showMenu(e, profile)}
                          >
                            <MoreVertical size={15} />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="pf-card-body">
                      <span className="pf-card-icon">
                        <ProfileIcon icon={profile.icon} size={22} />
                      </span>
                      <h3 className="pf-card-name" title={profile.name}>
                        {profile.name}
                      </h3>
                      <div className="pf-card-chips">
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
                      <div className="pf-card-foot">
                        <div className="pf-card-meta tiny">
                          <span title="Last played">
                            <Clock size={12} /> {formatRelative(profile.lastPlayed)}
                          </span>
                          <span title="Play time">
                            <Timer size={12} /> {formatPlayTime(profile.playTimeSeconds)}
                          </span>
                        </div>
                        <button
                          className="pf-play"
                          title={`Play ${profile.name}`}
                          aria-label={`Play ${profile.name}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            void selectProfile(profile.id).then(() => navigate('play'))
                          }}
                        >
                          <Play size={16} fill="currentColor" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )
              })}

              {!needle && (
                <motion.button layout className="pf-new" onClick={() => setWizardOpen(true)}>
                  <span className="pf-new-icon">
                    <Plus size={22} />
                  </span>
                  <span className="pf-new-title">New profile</span>
                  <span className="tiny">Pick a version, loader and mods</span>
                </motion.button>
              )}
            </div>
          )}
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

const DETAIL_TABS = [
  { id: 'mods', label: 'Mods', icon: Package },
  { id: 'resourcepacks', label: 'Resource Packs', icon: Image },
  { id: 'shaders', label: 'Shader Packs', icon: Sparkles },
  { id: 'settings', label: 'Settings', icon: SlidersHorizontal }
]

function ProfileDetail({ profileId }: { profileId: string }): ReactNode {
  const profiles = useApp((s) => s.profiles)
  const launches = useApp((s) => s.launches)
  const selectedProfileId = useApp((s) => s.selectedProfileId)
  const defaultRamMb = useApp((s) => s.settings.defaultRamMb)
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

  const mine = launches.filter((l) => l.profileId === profile.id)
  const preparing = mine.find((l) => PREPARING_PHASES.includes(l.phase))
  const running = mine.some((l) => l.phase === 'running')
  const ramMb = profile.ramMb || defaultRamMb

  const toggleFavorite = (): void => {
    void window.fvc.profiles
      .update(profile.id, { favorite: !profile.favorite })
      .catch((err) => pushNotification({ type: 'error', title: 'Could not save', body: String(err) }))
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <section className="pf-hero">
        <ProfileCover profile={profile} />

        <div className="pf-hero-top">
          <button className="pf-back" onClick={() => openProfile(null)}>
            <ArrowLeft size={16} /> Profiles
          </button>
          <div className="row" style={{ gap: 8 }}>
            <button
              className={`pf-glass-btn lg ${profile.favorite ? 'on' : ''}`}
              title={profile.favorite ? 'Unfavorite' : 'Favorite'}
              aria-label={profile.favorite ? 'Unfavorite' : 'Favorite'}
              onClick={toggleFavorite}
            >
              <Star size={16} fill={profile.favorite ? 'currentColor' : 'none'} />
            </button>
            <Button icon={FolderOpen} onClick={() => void window.fvc.profiles.openFolder(profile.id)}>
              Open folder
            </Button>
          </div>
        </div>

        <div className="pf-hero-main">
          <span className="pf-hero-icon">
            <ProfileIcon icon={profile.icon} size={32} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className={`pf-hero-label ${running ? 'running' : ''}`}>
              {running ? (
                <>
                  <span className="dot" /> Running now
                </>
              ) : profile.id === selectedProfileId ? (
                'Selected profile'
              ) : (
                'Profile'
              )}
            </div>
            <h1 className="pf-hero-title" title={profile.name}>
              {profile.name}
            </h1>
            <div className="home-chips">
              <span className="home-chip">Minecraft {profile.minecraftVersion}</span>
              <span className="home-chip">
                {LOADER_LABELS[profile.loader]}
                {profile.loaderVersion ? ` ${profile.loaderVersion}` : ''}
              </span>
              {profile.packSource && (
                <span
                  className="home-chip"
                  title={`Auto-updates from github.com/${profile.packSource.repo}`}
                >
                  <Github size={12} /> {profile.packSource.installedTag ?? 'Auto-update'}
                </span>
              )}
            </div>
          </div>
          <button
            className="btn-play pf-hero-play"
            disabled={!!preparing}
            onClick={() => void selectProfile(profile.id).then(() => navigate('play'))}
          >
            {preparing ? <span className="spinner" /> : <Play fill="currentColor" />}
            <span className="pf-hero-play-label">
              {preparing ? preparing.detail || 'Working…' : 'Play'}
            </span>
          </button>
        </div>

        <div className="pf-hero-stats">
          <HeroStat icon={Timer} label="Play time" value={formatPlayTime(profile.playTimeSeconds)} />
          <HeroStat icon={Clock} label="Last played" value={formatRelative(profile.lastPlayed)} />
          <HeroStat icon={MemoryStick} label="Memory" value={`${(ramMb / 1024).toFixed(1)} GB`} />
          <HeroStat
            icon={CalendarDays}
            label="Created"
            value={new Date(profile.createdAt).toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'short',
              year: 'numeric'
            })}
          />
        </div>
      </section>

      <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <Tabs
          tabs={DETAIL_TABS}
          active={tab}
          onChange={(t) => {
            setTab(t)
            setMode('installed')
          }}
        />
        {tab !== 'settings' && (
          <div className="segmented pf-view" role="radiogroup" aria-label="View">
            <button
              role="radio"
              aria-checked={mode === 'installed'}
              className={mode === 'installed' ? 'active' : ''}
              onClick={() => setMode('installed')}
            >
              <HardDrive size={14} /> Installed
            </button>
            <button
              role="radio"
              aria-checked={mode === 'browse'}
              className={mode === 'browse' ? 'active' : ''}
              onClick={() => setMode('browse')}
            >
              <Compass size={14} /> Browse Modrinth
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
}

function HeroStat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }): ReactNode {
  return (
    <div className="pf-hero-stat">
      <Icon size={16} />
      <div style={{ minWidth: 0 }}>
        <div className="pf-hero-stat-label">{label}</div>
        <div className="pf-hero-stat-value">{value}</div>
      </div>
    </div>
  )
}

function ProfileSettings({ profile }: { profile: Profile }): ReactNode {
  const pushNotification = useApp((s) => s.pushNotification)
  const { upload, uploading } = useUploadIcon()
  const [iconPickerOpen, setIconPickerOpen] = useState(false)
  const patch = (p: Partial<Profile>): void => {
    void window.fvc.profiles.update(profile.id, p).catch((err) =>
      pushNotification({ type: 'error', title: 'Could not save', body: String(err) })
    )
  }
  return (
    <div className="card pf-settings">
      <div className="setting-row">
        <div className="pf-setting-info">
          <span className="pf-setting-media">
            <span className="pf-setting-icon">
              <ProfileIcon icon={profile.icon} size={20} />
            </span>
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="s-label">Icon</div>
            <div className="s-desc">A built-in icon or your own image, shown on the profile card, Home and Play</div>
          </div>
        </div>
        <div className="s-control row" style={{ gap: 8 }}>
          <Button
            icon={ImagePlus}
            loading={uploading}
            onClick={() => void upload().then((icon) => icon && patch({ icon }))}
          >
            Upload image
          </Button>
          <Button icon={Shapes} onClick={() => setIconPickerOpen(true)}>
            Choose icon
          </Button>
        </div>
        <Modal open={iconPickerOpen} onClose={() => setIconPickerOpen(false)} title="Profile icon">
          <div className="modal-body">
            <ProfileIconPicker
              value={profile.icon}
              onChange={(icon) => {
                patch({ icon })
                setIconPickerOpen(false)
              }}
            />
          </div>
        </Modal>
      </div>
      <div className="setting-row">
        <div className="pf-setting-info">
          <div className="pf-setting-media">
            <ProfileCover profile={profile} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="s-label">Background image</div>
            <div className="s-desc">Shown on the Play page, the profile card and the banner above</div>
          </div>
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
        <div className="pf-setting-info">
          <span className="pf-setting-media">
            <Coffee size={20} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="s-label">Java executable</div>
            {profile.javaPath ? (
              <div className="s-desc pf-path" title={profile.javaPath}>
                {profile.javaPath}
              </div>
            ) : (
              <div className="s-desc">Managed automatically by the launcher</div>
            )}
          </div>
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
