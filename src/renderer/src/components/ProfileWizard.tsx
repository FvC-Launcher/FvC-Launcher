import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Compass,
  Download,
  Eye,
  ExternalLink,
  FileArchive,
  Github,
  HardDrive,
  Image as ImageIcon,
  MemoryStick,
  Package,
  PackageOpen,
  Search,
  Sparkles,
  Upload,
  X
} from 'lucide-react'
import { Button, Input, Modal, Progress, Select, Toggle } from '@/components/ui'
import { ProfileCover } from '@/components/ProfileCover'
import { CommunityPackList } from '@/components/CommunityPackList'
import { formatCount, formatRelative, useApp } from '@/store'
import { ProfileIcon, ProfileIconPicker } from '@/components/ProfileIcon'
import { LOADERS, LOADER_LABELS, titleCase } from '@/lib'
import type {
  CurseForgePack,
  LoaderId,
  LoaderVersionInfo,
  McVersion,
  ModpackProgress,
  ModrinthSearchHit,
  ModrinthVersion,
  Profile
} from '@shared/types'

type WizardKind = 'empty' | 'modpack' | 'community' | 'import'
type PackSource = 'modrinth' | 'curseforge'
type StepId = 'type' | 'version' | 'pack' | 'community' | 'import' | 'details' | 'memory'

type PackSelection =
  | { type: 'modrinth'; hit: ModrinthSearchHit }
  | { type: 'curseforge'; pack: CurseForgePack }
  | { type: 'zip'; path: string }
  | null

const STEP_INFO: Record<StepId, { label: string; hint: string; title: string; description: string }> = {
  type: {
    label: 'Start',
    hint: 'Choose how to begin',
    title: 'How do you want to start?',
    description: 'Build your own setup, install a modpack, or bring in one you already have.'
  },
  version: {
    label: 'Game',
    hint: 'Minecraft & loader',
    title: 'Pick a version and loader',
    description: 'The loader decides which mods the profile can run.'
  },
  pack: {
    label: 'Modpack',
    hint: 'Browse or upload',
    title: 'Choose a modpack',
    description: 'The pack decides the Minecraft version and loader for you.'
  },
  community: {
    label: 'Community',
    hint: 'FvC packs on GitHub',
    title: 'Community modpacks',
    description: 'Packs shared by FvC players. They update themselves when the author publishes a release.'
  },
  import: {
    label: 'Import',
    hint: 'File or GitHub link',
    title: 'Import a profile',
    description: 'Bring in a profile exported from FvC Launcher, from this computer or from GitHub.'
  },
  details: {
    label: 'Details',
    hint: 'Name & look',
    title: 'Name your profile',
    description: 'Give it a name, an icon and an optional cover image.'
  },
  memory: {
    label: 'Memory',
    hint: 'RAM & review',
    title: 'Memory and review',
    description: 'Choose how much RAM the game may use, then check everything.'
  }
}

const KIND_STEPS: Record<WizardKind, StepId[]> = {
  empty: ['type', 'version', 'details', 'memory'],
  modpack: ['type', 'pack', 'details', 'memory'],
  community: ['type', 'community'],
  import: ['type', 'import']
}

const LOADER_INFO: Record<LoaderId, { tagline: string; color: string }> = {
  vanilla: { tagline: 'Pure Minecraft, no mods', color: '#62b47a' },
  fabric: { tagline: 'Lightweight, fast updates', color: '#dbb68f' },
  forge: { tagline: 'The largest mod catalog', color: '#e0864a' },
  neoforge: { tagline: 'Modern fork of Forge', color: '#f16436' },
  quilt: { tagline: 'Fabric-compatible fork', color: '#a78bfa' }
}

const RAM_PRESETS = [2048, 4096, 6144, 8192, 12288]

const PACK_SORTS_MR = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'downloads', label: 'Most downloaded' },
  { value: 'follows', label: 'Most followed' },
  { value: 'newest', label: 'Newest' },
  { value: 'updated', label: 'Recently updated' }
]

const PACK_SORTS_CF = [
  { value: 'popularity', label: 'Popularity' },
  { value: 'downloads', label: 'Most downloaded' },
  { value: 'updated', label: 'Recently updated' },
  { value: 'featured', label: 'Featured' },
  { value: 'name', label: 'Name' }
]

export function ProfileWizard({ open, onClose }: { open: boolean; onClose: () => void }): ReactNode {
  const pushNotification = useApp((s) => s.pushNotification)
  const openProfile = useApp((s) => s.openProfile)
  const openProject = useApp((s) => s.openProject)
  const totalRamMb = useApp((s) => s.totalRamMb)

  const [kind, setKind] = useState<WizardKind>('empty')
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('Package')
  const [cover, setCover] = useState('')
  const [mcVersions, setMcVersions] = useState<McVersion[]>([])
  const [showSnapshots, setShowSnapshots] = useState(false)
  const [showHistoricalVersions, setShowHistoricalVersions] = useState(false)
  const [mcVersion, setMcVersion] = useState('')
  const [loader, setLoader] = useState<LoaderId>('vanilla')
  const [loaderVersions, setLoaderVersions] = useState<LoaderVersionInfo[] | null>(null)
  const [loaderVersion, setLoaderVersion] = useState('')
  const [ramMb, setRamMb] = useState(4096)
  const [creating, setCreating] = useState(false)
  // Tints the preview banner until the real profile (and its id) exists.
  const [previewSeed, setPreviewSeed] = useState('new-profile')

  // ---- Modpack browser state ----
  const [source, setSource] = useState<PackSource>('modrinth')
  const [packQuery, setPackQuery] = useState('')
  const [mrSort, setMrSort] = useState('downloads')
  const [cfSort, setCfSort] = useState('popularity')
  const [packMcFilter, setPackMcFilter] = useState('')
  const [mrHits, setMrHits] = useState<ModrinthSearchHit[]>([])
  const [cfHits, setCfHits] = useState<CurseForgePack[]>([])
  const [packLoading, setPackLoading] = useState(false)
  const [cfError, setCfError] = useState<string | null>(null)
  const [hasCfKey, setHasCfKey] = useState(false)
  const [selection, setSelection] = useState<PackSelection>(null)
  const [packVersions, setPackVersions] = useState<ModrinthVersion[] | null>(null)
  const [packVersionId, setPackVersionId] = useState('')
  const [installProgress, setInstallProgress] = useState<ModpackProgress | null>(null)

  // ---- Import / community state ----
  const [importBusy, setImportBusy] = useState<'file' | 'github' | 'community' | null>(null)
  const [githubLink, setGithubLink] = useState('')

  const steps = KIND_STEPS[kind]
  const quickKind = kind === 'community' || kind === 'import'
  const stepId = steps[step]

  // Reset on open.
  useEffect(() => {
    if (open) {
      setKind('empty')
      setStep(0)
      setName('')
      setIcon('Package')
      setCover('')
      setShowSnapshots(false)
      setShowHistoricalVersions(false)
      setMcVersion('')
      setLoader('vanilla')
      setLoaderVersion('')
      setRamMb(4096)
      setSource('modrinth')
      setPackQuery('')
      setPackMcFilter('')
      setSelection(null)
      setPackVersions(null)
      setPackVersionId('')
      setInstallProgress(null)
      setCreating(false)
      setCfError(null)
      setPreviewSeed(String(Math.random()))
      setImportBusy(null)
      setGithubLink('')
      void window.fvc.curseforge.hasApiKey().then(setHasCfKey)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    void window.fvc.versions
      .minecraft(showSnapshots, showHistoricalVersions)
      .then((versions) => {
        setMcVersions(versions)
        setMcVersion((current) => current || versions.find((v) => v.type === 'release')?.id || '')
      })
      .catch((err) =>
        pushNotification({ type: 'error', title: 'Could not load Minecraft versions', body: String(err) })
      )
  }, [open, showSnapshots, showHistoricalVersions, pushNotification])

  // Loader versions (empty-profile branch).
  useEffect(() => {
    if (!open || kind !== 'empty' || loader === 'vanilla' || !mcVersion) return
    setLoaderVersions(null)
    setLoaderVersion('')
    void window.fvc.versions
      .loader(loader, mcVersion)
      .then((list) => {
        setLoaderVersions(list)
        const preferred = list.find((v) => v.recommended) ?? list.find((v) => v.stable) ?? list[0]
        if (preferred) setLoaderVersion(preferred.version)
      })
      .catch(() => setLoaderVersions([]))
  }, [open, kind, loader, mcVersion])

  // Live modpack search (both sources).
  useEffect(() => {
    if (!open || stepId !== 'pack') return
    setPackLoading(true)
    setCfError(null)
    const timer = setTimeout(() => {
      if (source === 'modrinth') {
        window.fvc.modrinth
          .search({
            query: packQuery,
            projectType: 'modpack',
            gameVersion: packMcFilter || undefined,
            index: mrSort as never,
            limit: 20
          })
          .then((result) => setMrHits(result.hits))
          .catch(() => setMrHits([]))
          .finally(() => setPackLoading(false))
      } else {
        window.fvc.curseforge
          .searchPacks({
            query: packQuery,
            gameVersion: packMcFilter || undefined,
            sort: cfSort as never
          })
          .then((hits) => setCfHits(hits))
          .catch((err) => {
            setCfHits([])
            setCfError(err instanceof Error ? err.message : String(err))
          })
          .finally(() => setPackLoading(false))
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [open, stepId, source, packQuery, mrSort, cfSort, packMcFilter])

  // Versions of the selected Modrinth pack.
  useEffect(() => {
    if (selection?.type !== 'modrinth') {
      setPackVersions(null)
      setPackVersionId('')
      return
    }
    setPackVersions(null)
    setPackVersionId('')
    void window.fvc.modrinth
      .versions(selection.hit.project_id)
      .then((versions) => {
        setPackVersions(versions)
        if (versions[0]) setPackVersionId(versions[0].id)
      })
      .catch(() => setPackVersions([]))
  }, [selection])

  // Staged install progress from the main process.
  useEffect(() => {
    if (!open) return
    return window.fvc.modpacks.onProgress(setInstallProgress)
  }, [open])

  const maxRam = Math.max(2048, totalRamMb - 2048)
  const packReady =
    selection !== null && (selection.type !== 'modrinth' || (packVersionId !== '' && packVersions !== null))

  const stepValid = (id: StepId): boolean => {
    switch (id) {
      case 'version':
        return mcVersion !== '' && (loader === 'vanilla' || loaderVersion !== '')
      case 'pack':
        return packReady
      case 'details':
        return name.trim().length > 0
      default:
        return true
    }
  }
  const canNext = stepValid(stepId)
  const isLastStep = step === steps.length - 1
  const canCreate = steps.every(stepValid)

  const selectedPackName =
    selection?.type === 'modrinth'
      ? selection.hit.title
      : selection?.type === 'curseforge'
        ? selection.pack.name
        : selection?.type === 'zip'
          ? (selection.path.split(/[\\/]/).pop() ?? 'modpack').replace(/\.zip$/i, '')
          : ''

  const next = (): void => {
    if (!canNext) return
    // A modpack usually already has a good name; offer it.
    if (stepId === 'pack' && !name.trim() && selectedPackName) setName(selectedPackName)
    setStep((s) => Math.min(s + 1, steps.length - 1))
  }
  const back = (): void => setStep((s) => Math.max(s - 1, 0))
  const goTo = (index: number): void => {
    // Only jump back, or forward past steps that are already complete.
    if (index <= step || steps.slice(0, index).every(stepValid)) setStep(index)
  }

  const uploadZip = async (): Promise<void> => {
    const path = await window.fvc.curseforge.pickZip()
    if (path) setSelection({ type: 'zip', path })
  }

  const pickCover = (): void => {
    void window.fvc.system.pickImage().then((img) => img && setCover(img))
  }

  const create = async (): Promise<void> => {
    setCreating(true)
    try {
      let profile
      if (kind === 'modpack' && selection) {
        if (selection.type === 'modrinth') {
          profile = await window.fvc.modpacks.install({
            name: name.trim(),
            icon,
            backgroundImage: cover || undefined,
            ramMb,
            projectId: selection.hit.project_id,
            versionId: packVersionId
          })
        } else if (selection.type === 'curseforge') {
          profile = await window.fvc.curseforge.install({
            name: name.trim(),
            icon,
            backgroundImage: cover || undefined,
            ramMb,
            modId: selection.pack.id
          })
        } else {
          profile = await window.fvc.curseforge.installZip({
            name: name.trim(),
            icon,
            backgroundImage: cover || undefined,
            ramMb,
            zipPath: selection.path
          })
        }
      } else {
        profile = await window.fvc.profiles.create({
          name: name.trim(),
          minecraftVersion: mcVersion,
          loader,
          loaderVersion: loader === 'vanilla' ? undefined : loaderVersion,
          ramMb,
          icon,
          backgroundImage: cover || undefined
        })
        pushNotification({ type: 'success', title: `${profile.name} created` })
      }
      onClose()
      openProfile(profile.id)
    } catch (err) {
      pushNotification({
        type: 'error',
        title: kind === 'modpack' ? 'Modpack installation failed' : 'Could not create profile',
        body: err instanceof Error ? err.message : String(err)
      })
      setInstallProgress(null)
    } finally {
      setCreating(false)
    }
  }

  /** Imports and community installs create the profile in one go. */
  const finishImport = (profile: Profile): void => {
    if (profile.packSource) {
      pushNotification({
        type: 'info',
        title: `${profile.name} added`,
        body: `Auto-updates from github.com/${profile.packSource.repo}. The latest release is fetched when you press Play.`
      })
    } else {
      pushNotification({ type: 'success', title: `${profile.name} imported` })
    }
    onClose()
    openProfile(profile.id)
  }

  const importFile = async (): Promise<void> => {
    setImportBusy('file')
    try {
      const profile = await window.fvc.profiles.importProfile()
      if (profile) finishImport(profile)
    } catch (err) {
      pushNotification({ type: 'error', title: 'Import failed', body: err instanceof Error ? err.message : String(err) })
    } finally {
      setImportBusy(null)
    }
  }

  const importGithub = async (): Promise<void> => {
    const repo = githubLink.trim()
    if (!repo || importBusy) return
    setImportBusy('github')
    try {
      finishImport(await window.fvc.profiles.importFromGithub(repo))
    } catch (err) {
      // Keep the step open so the link can be corrected.
      pushNotification({ type: 'error', title: 'Import failed', body: err instanceof Error ? err.message : String(err) })
    } finally {
      setImportBusy(null)
    }
  }

  const installing = creating && kind === 'modpack'
  const locked = installing || importBusy !== null
  const releases = useMemo(() => mcVersions.filter((v) => v.type === 'release').slice(0, 5), [mcVersions])
  const packVersion = packVersions?.find((v) => v.id === packVersionId)

  // What the preview card and the review list show for "game".
  const gameLabel =
    kind === 'modpack'
      ? selection?.type === 'modrinth' && packVersion
        ? `${packVersion.game_versions.slice(-1)[0] ?? ''} · ${packVersion.loaders.map(titleCase).join('/')}`
        : selection
          ? 'Set by the modpack'
          : 'Choose a modpack'
      : `${mcVersion || '…'} · ${LOADER_LABELS[loader]}`

  const info = STEP_INFO[stepId]

  return (
    <Modal
      open={open}
      onClose={() => !locked && onClose()}
      className="wizard"
      footer={
        installing ? undefined : (
          <>
            <span className="tiny wz-footer-step">
              Step {step + 1} of {steps.length}
            </span>
            <div style={{ flex: 1 }} />
            {step > 0 && (
              <Button icon={ArrowLeft} onClick={back} disabled={locked}>
                Back
              </Button>
            )}
            {step > 0 && quickKind ? null : !isLastStep ? (
              <Button variant="primary" disabled={!canNext} onClick={next}>
                Continue <ArrowRight size={15} />
              </Button>
            ) : (
              <Button
                variant="primary"
                icon={kind === 'modpack' ? Download : Sparkles}
                loading={creating}
                disabled={!canCreate}
                onClick={() => void create()}
              >
                {kind === 'modpack' ? 'Install modpack' : 'Create profile'}
              </Button>
            )}
          </>
        )
      }
    >
      {installing ? (
        <div className="modal-body">
          <InstallProgressView progress={installProgress} packName={selectedPackName || name} />
        </div>
      ) : (
        <div className="wz">
          {/* ------------------------------------------------------ Sidebar */}
          <aside className="wz-side">
            {!quickKind && (
            <div className="wz-preview">
              <div className="wz-preview-cover">
                <ProfileCover profile={{ id: previewSeed, icon, backgroundImage: cover || undefined }} />
                <span className="wz-preview-icon">
                  <PreviewIcon name={icon} />
                </span>
              </div>
              <div className="wz-preview-body">
                <div className={`wz-preview-name ${name.trim() ? '' : 'placeholder'}`} title={name}>
                  {name.trim() || 'New profile'}
                </div>
                <div className="wz-preview-meta">{gameLabel}</div>
                <div className="wz-preview-meta">
                  <MemoryStick size={11} /> {(ramMb / 1024).toFixed(1)} GB
                </div>
              </div>
            </div>
            )}

            <ol className="wz-steps">
              {steps.map((id, i) => {
                const done = i < step && stepValid(id)
                return (
                  <li key={id}>
                    <button
                      className={`wz-step ${i === step ? 'current' : ''} ${done ? 'done' : ''}`}
                      onClick={() => !locked && goTo(i)}
                    >
                      <span className="wz-step-dot">{done ? <Check size={12} strokeWidth={3} /> : i + 1}</span>
                      <span className="wz-step-text">
                        <span className="wz-step-label">{STEP_INFO[id].label}</span>
                        <span className="wz-step-hint">{STEP_INFO[id].hint}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </aside>

          {/* --------------------------------------------------------- Main */}
          <section className="wz-main">
            <header className="wz-head">
              <div>
                <h2>{info.title}</h2>
                <p className="tiny">{info.description}</p>
              </div>
              <button className="wz-close" onClick={onClose} disabled={locked} aria-label="Close">
                <X size={18} />
              </button>
            </header>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${kind}-${stepId}`}
                className="wz-content"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16 }}
              >
                {stepId === 'type' && (
                  <div className="wz-kinds">
                    <KindCard
                      active={kind === 'empty'}
                      icon={Package}
                      title="Custom profile"
                      description="Pick a Minecraft version and loader, start clean and add mods yourself."
                      points={['Any version, including snapshots', 'Vanilla, Fabric, Forge, NeoForge or Quilt']}
                      onClick={() => setKind('empty')}
                    />
                    <KindCard
                      active={kind === 'modpack'}
                      icon={PackageOpen}
                      title="Modpack"
                      description="Install a complete pack from Modrinth or CurseForge, or import a CurseForge .zip."
                      points={['Mods, configs and loader set up for you', 'Choose the exact pack version']}
                      onClick={() => setKind('modpack')}
                    />
                    <KindOption
                      active={kind === 'community'}
                      icon={Compass}
                      title="Community packs"
                      description="Self-updating packs shared by FvC players"
                      onClick={() => setKind('community')}
                    />
                    <KindOption
                      active={kind === 'import'}
                      icon={Upload}
                      title="Import"
                      description="A .fvcpack file or a GitHub link"
                      onClick={() => setKind('import')}
                    />
                  </div>
                )}

                {stepId === 'community' && (
                  <CommunityPackList
                    onInstalled={finishImport}
                    onBusyChange={(busy) => setImportBusy(busy ? 'community' : null)}
                  />
                )}

                {stepId === 'import' && (
                  <div className="stack" style={{ gap: 14 }}>
                    <div className="wz-import">
                      <span className="wz-kind-icon">
                        <HardDrive size={22} />
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="wz-kind-title">From this computer</div>
                        <div className="wz-kind-desc">Pick a .fvcpack file exported from FvC Launcher.</div>
                      </div>
                      <Button
                        variant="primary"
                        icon={FileArchive}
                        loading={importBusy === 'file'}
                        disabled={importBusy !== null}
                        onClick={() => void importFile()}
                      >
                        Choose file
                      </Button>
                    </div>

                    <div className="wz-import column">
                      <div className="row" style={{ gap: 14 }}>
                        <span className="wz-kind-icon">
                          <Github size={22} />
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="wz-kind-title">From GitHub</div>
                          <div className="wz-kind-desc">
                            Paste a repository link. Its latest release is imported, and future releases install
                            automatically when you press Play.
                          </div>
                        </div>
                      </div>
                      <div className="row" style={{ gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <Input
                            placeholder="https://github.com/owner/repo"
                            value={githubLink}
                            disabled={importBusy !== null}
                            onChange={(e) => setGithubLink(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && void importGithub()}
                          />
                        </div>
                        <Button
                          variant="primary"
                          icon={Download}
                          loading={importBusy === 'github'}
                          disabled={!githubLink.trim() || importBusy !== null}
                          onClick={() => void importGithub()}
                        >
                          Import
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {stepId === 'version' && (
                  <div className="stack" style={{ gap: 22 }}>
                    <div className="wz-field">
                      <div className="wz-label">Minecraft version</div>
                      <div className="wz-chips">
                        {releases.map((v, i) => (
                          <button
                            key={v.id}
                            className={`wz-chip ${mcVersion === v.id ? 'active' : ''}`}
                            onClick={() => setMcVersion(v.id)}
                          >
                            {v.id}
                            {i === 0 && <span className="wz-chip-tag">Latest</span>}
                          </button>
                        ))}
                      </div>
                      <div className="wz-version-row">
                        <div style={{ flex: 1, minWidth: 180 }}>
                          <Select
                            value={mcVersion}
                            options={mcVersions.map((v) => ({
                              value: v.id,
                              label: v.id,
                              hint: v.type !== 'release' ? v.type : undefined
                            }))}
                            onChange={setMcVersion}
                          />
                        </div>
                        <label className="wz-toggle">
                          <Toggle checked={showSnapshots} onChange={setShowSnapshots} />
                          Snapshots
                        </label>
                        <label className="wz-toggle">
                          <Toggle checked={showHistoricalVersions} onChange={setShowHistoricalVersions} />
                          Before 1.0
                        </label>
                      </div>
                    </div>

                    <div className="wz-field">
                      <div className="wz-label">Mod loader</div>
                      <div className="wz-loaders">
                        {LOADERS.map((id) => (
                          <button
                            key={id}
                            className={`wz-loader ${loader === id ? 'active' : ''}`}
                            style={{ ['--loader' as never]: LOADER_INFO[id].color }}
                            onClick={() => setLoader(id)}
                          >
                            <span className="wz-loader-mark">{LOADER_LABELS[id].charAt(0)}</span>
                            <span style={{ minWidth: 0 }}>
                              <span className="wz-loader-name">{LOADER_LABELS[id]}</span>
                              <span className="wz-loader-tag">{LOADER_INFO[id].tagline}</span>
                            </span>
                            {loader === id && <Check size={15} className="wz-loader-check" />}
                          </button>
                        ))}
                      </div>
                    </div>

                    {loader !== 'vanilla' && (
                      <div className="wz-field">
                        <div className="wz-label">
                          {LOADER_LABELS[loader]} version for {mcVersion || 'Minecraft'}
                        </div>
                        {loaderVersions === null ? (
                          <div className="row" style={{ gap: 10, padding: '8px 2px' }}>
                            <span className="spinner" style={{ color: 'var(--accent)' }} />
                            <span className="tiny">Loading versions…</span>
                          </div>
                        ) : loaderVersions.length === 0 ? (
                          <div className="wz-note warn">
                            No {LOADER_LABELS[loader]} builds exist for Minecraft {mcVersion}. Pick another
                            version or loader.
                          </div>
                        ) : (
                          <Select
                            value={loaderVersion}
                            options={loaderVersions.slice(0, 60).map((v) => ({
                              value: v.version,
                              label: v.version,
                              hint: v.recommended ? 'recommended' : v.stable ? 'stable' : 'beta'
                            }))}
                            onChange={setLoaderVersion}
                          />
                        )}
                      </div>
                    )}
                  </div>
                )}

                {stepId === 'details' && (
                  <div className="stack" style={{ gap: 22 }}>
                    <div className="wz-field">
                      <div className="wz-label">Profile name</div>
                      <Input
                        autoFocus
                        className="wz-name"
                        placeholder={kind === 'modpack' ? 'My modpack' : 'My awesome profile'}
                        value={name}
                        maxLength={64}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && next()}
                      />
                    </div>

                    <div className="wz-field">
                      <div className="wz-label">Icon</div>
                      <ProfileIconPicker value={icon} onChange={setIcon} />
                    </div>

                    <div className="wz-field">
                      <div className="wz-label">
                        Cover image <span className="wz-optional">optional</span>
                      </div>
                      {cover ? (
                        <div className="wz-cover has-image" style={{ backgroundImage: `url("${cover}")` }}>
                          <div className="row" style={{ gap: 6 }}>
                            <Button icon={ImageIcon} onClick={pickCover}>
                              Change
                            </Button>
                            <Button variant="danger" icon={X} onClick={() => setCover('')} aria-label="Remove cover" />
                          </div>
                        </div>
                      ) : (
                        <button className="wz-cover" onClick={pickCover}>
                          <ImageIcon size={20} />
                          <span>Choose an image</span>
                          <span className="tiny">Shown on the profile card and the Play page</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {stepId === 'memory' && (
                  <div className="stack" style={{ gap: 22 }}>
                    <div className="wz-field">
                      <div className="wz-label">Allocated RAM</div>
                      <div className="wz-chips">
                        {RAM_PRESETS.filter((mb) => mb <= maxRam).map((mb) => (
                          <button
                            key={mb}
                            className={`wz-chip ${ramMb === mb ? 'active' : ''}`}
                            onClick={() => setRamMb(mb)}
                          >
                            {mb / 1024} GB
                            {mb === (kind === 'modpack' ? 6144 : 4096) && <span className="wz-chip-tag">Suggested</span>}
                          </button>
                        ))}
                      </div>
                      <div className="wz-ram">
                        <input
                          type="range"
                          className="slider"
                          min={1024}
                          max={maxRam}
                          step={512}
                          value={Math.min(ramMb, maxRam)}
                          onChange={(e) => setRamMb(Number(e.target.value))}
                          style={{ ['--slider-fill' as never]: `${((ramMb - 1024) / (maxRam - 1024)) * 100}%` }}
                        />
                        <span className="wz-ram-value">{(ramMb / 1024).toFixed(1)} GB</span>
                      </div>
                      <p className="tiny">
                        {(ramMb / 1024).toFixed(1)} of {(totalRamMb / 1024).toFixed(0)} GB on this computer.{' '}
                        {kind === 'modpack'
                          ? '6–8 GB suits most modpacks; big ones may want more.'
                          : '4 GB is plenty for vanilla and light mod setups.'}
                      </p>
                    </div>

                    <div className="wz-review">
                      <ReviewRow label="Name" value={name.trim() || '—'} onEdit={() => goTo(steps.indexOf('details'))} />
                      {kind === 'modpack' ? (
                        <>
                          <ReviewRow
                            label="Modpack"
                            value={selectedPackName || '—'}
                            onEdit={() => goTo(steps.indexOf('pack'))}
                          />
                          {packVersion && (
                            <ReviewRow label="Pack version" value={packVersion.name || packVersion.version_number} />
                          )}
                        </>
                      ) : (
                        <>
                          <ReviewRow label="Minecraft" value={mcVersion} onEdit={() => goTo(steps.indexOf('version'))} />
                          <ReviewRow
                            label="Loader"
                            value={LOADER_LABELS[loader] + (loader !== 'vanilla' ? ` ${loaderVersion}` : '')}
                            onEdit={() => goTo(steps.indexOf('version'))}
                          />
                        </>
                      )}
                      <ReviewRow label="Memory" value={`${(ramMb / 1024).toFixed(1)} GB`} />
                    </div>
                  </div>
                )}

                {stepId === 'pack' && (
                  <div className="stack" style={{ gap: 12 }}>
                    <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
                      <div className="segmented">
                        {(['modrinth', 'curseforge'] as const).map((s) => (
                          <button
                            key={s}
                            className={source === s ? 'active' : ''}
                            onClick={() => {
                              setSource(s)
                              if (selection && selection.type !== 'zip') setSelection(null)
                            }}
                          >
                            {s === 'modrinth' ? 'Modrinth' : 'CurseForge'}
                          </button>
                        ))}
                      </div>
                      <div className="row" style={{ gap: 8 }}>
                        <div style={{ width: 150 }}>
                          <Select
                            value={packMcFilter}
                            options={[
                              { value: '', label: 'Any version' },
                              ...mcVersions.slice(0, 60).map((v) => ({ value: v.id, label: v.id }))
                            ]}
                            onChange={setPackMcFilter}
                          />
                        </div>
                        <div style={{ width: 170 }}>
                          {source === 'modrinth' ? (
                            <Select value={mrSort} options={PACK_SORTS_MR} onChange={setMrSort} />
                          ) : (
                            <Select value={cfSort} options={PACK_SORTS_CF} onChange={setCfSort} />
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="pf-search" style={{ maxWidth: 'none' }}>
                      <Search size={16} />
                      <Input
                        placeholder={`Search modpacks on ${source === 'modrinth' ? 'Modrinth' : 'CurseForge'}…`}
                        value={packQuery}
                        onChange={(e) => setPackQuery(e.target.value)}
                        style={{ paddingLeft: 38 }}
                      />
                    </div>

                    <div className="wz-packs">
                      {packLoading ? (
                        <div className="empty-state" style={{ padding: 26 }}>
                          <span className="spinner" style={{ width: 24, height: 24, color: 'var(--accent)' }} />
                        </div>
                      ) : source === 'curseforge' && cfError ? (
                        <div className="wz-note warn">
                          {cfError}
                          {!hasCfKey && ' You can still import a CurseForge .zip below; no key needed.'}
                        </div>
                      ) : (source === 'modrinth' ? mrHits.length : cfHits.length) === 0 ? (
                        <div className="empty-state" style={{ padding: 26 }}>
                          <Package />
                          <span style={{ fontSize: '0.86rem' }}>No modpacks found.</span>
                        </div>
                      ) : source === 'modrinth' ? (
                        mrHits.map((hit) => (
                          <PackRow
                            key={hit.project_id}
                            icon={hit.icon_url}
                            title={hit.title}
                            author={hit.author}
                            description={hit.description}
                            downloads={hit.downloads}
                            updated={hit.date_modified}
                            badges={(hit.display_categories ?? hit.categories)?.slice(0, 2) ?? []}
                            selected={selection?.type === 'modrinth' && selection.hit.project_id === hit.project_id}
                            onSelect={() => setSelection({ type: 'modrinth', hit })}
                            extra={
                              <Button
                                variant="subtle"
                                icon={Eye}
                                onClick={() => openProject(hit.project_id, true)}
                                aria-label="Details"
                                title="Details"
                              />
                            }
                          />
                        ))
                      ) : (
                        cfHits.map((pack) => (
                          <PackRow
                            key={pack.id}
                            icon={pack.logoUrl}
                            title={pack.name}
                            author={pack.author}
                            description={pack.summary}
                            downloads={pack.downloads}
                            updated={pack.dateModified}
                            badges={pack.categories.slice(0, 2)}
                            selected={selection?.type === 'curseforge' && selection.pack.id === pack.id}
                            onSelect={() => setSelection({ type: 'curseforge', pack })}
                            extra={
                              pack.websiteUrl ? (
                                <Button
                                  variant="subtle"
                                  icon={ExternalLink}
                                  onClick={() => window.fvc.system.openExternal(pack.websiteUrl!)}
                                  aria-label="Open on CurseForge"
                                  title="Open on CurseForge"
                                />
                              ) : undefined
                            }
                          />
                        ))
                      )}
                    </div>

                    {/* Selection bar: pack version, or the uploaded zip, or the upload button */}
                    <div className="wz-pack-bar">
                      {selection?.type === 'modrinth' ? (
                        <>
                          <span className="wz-pack-bar-label">
                            <Check size={14} /> {selection.hit.title}
                          </span>
                          <div style={{ flex: 1, minWidth: 200 }}>
                            {packVersions === null ? (
                              <div className="row" style={{ gap: 8 }}>
                                <span className="spinner" style={{ color: 'var(--accent)' }} />
                                <span className="tiny">Loading versions…</span>
                              </div>
                            ) : (
                              <Select
                                value={packVersionId}
                                options={packVersions.slice(0, 40).map((v) => ({
                                  value: v.id,
                                  label: v.name || v.version_number,
                                  hint: `${v.game_versions.slice(-1)[0] ?? ''} · ${v.loaders.join('/')}`
                                }))}
                                onChange={setPackVersionId}
                              />
                            )}
                          </div>
                        </>
                      ) : selection?.type === 'zip' ? (
                        <>
                          <span className="wz-pack-bar-label">
                            <FileArchive size={14} /> {selection.path.split(/[\\/]/).pop()}
                          </span>
                          <div style={{ flex: 1 }} />
                          <Button variant="subtle" icon={X} onClick={() => setSelection(null)}>
                            Remove
                          </Button>
                        </>
                      ) : selection?.type === 'curseforge' ? (
                        <span className="wz-pack-bar-label">
                          <Check size={14} /> {selection.pack.name} · latest version
                        </span>
                      ) : (
                        <span className="tiny">Select a pack above, or</span>
                      )}
                      {selection?.type !== 'zip' && (
                        <Button icon={Upload} onClick={() => void uploadZip()} style={{ marginLeft: 'auto' }}>
                          Upload .zip
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </section>
        </div>
      )}
    </Modal>
  )
}

// ------------------------------------------------------------ small parts

function PreviewIcon({ name }: { name: string }): ReactNode {
  return <ProfileIcon icon={name} size={22} />
}

function KindCard({
  active,
  icon: Icon,
  title,
  description,
  points,
  onClick
}: {
  active: boolean
  icon: typeof Package
  title: string
  description: string
  points: string[]
  onClick: () => void
}): ReactNode {
  return (
    <button className={`wz-kind ${active ? 'active' : ''}`} onClick={onClick}>
      <span className="wz-kind-icon">
        <Icon size={24} />
      </span>
      <span className="wz-kind-title">{title}</span>
      <span className="wz-kind-desc">{description}</span>
      <span className="wz-kind-points">
        {points.map((p) => (
          <span key={p}>
            <Check size={12} /> {p}
          </span>
        ))}
      </span>
      <span className="wz-kind-radio">{active && <Check size={12} strokeWidth={3} />}</span>
    </button>
  )
}

function KindOption({
  active,
  icon: Icon,
  title,
  description,
  onClick
}: {
  active: boolean
  icon: typeof Package
  title: string
  description: string
  onClick: () => void
}): ReactNode {
  return (
    <button className={`wz-kind compact ${active ? 'active' : ''}`} onClick={onClick}>
      <span className="wz-kind-icon">
        <Icon size={20} />
      </span>
      <span style={{ minWidth: 0 }}>
        <span className="wz-kind-title">{title}</span>
        <span className="wz-kind-desc">{description}</span>
      </span>
      <span className="wz-kind-radio">{active && <Check size={12} strokeWidth={3} />}</span>
    </button>
  )
}

function ReviewRow({ label, value, onEdit }: { label: string; value: string; onEdit?: () => void }): ReactNode {
  return (
    <div className="wz-review-row">
      <span className="wz-review-label">{label}</span>
      <span className="wz-review-value" title={value}>
        {value}
      </span>
      {onEdit ? (
        <button className="wz-review-edit" onClick={onEdit}>
          Edit
        </button>
      ) : (
        <span className="wz-review-edit" />
      )}
    </div>
  )
}

function PackRow(props: {
  icon: string | null
  title: string
  author: string
  description: string
  downloads: number
  updated: string
  badges: string[]
  selected: boolean
  onSelect: () => void
  extra?: ReactNode
}): ReactNode {
  return (
    <div className={`wz-pack mod-row ${props.selected ? "selected" : ""}`} onClick={props.onSelect}>
      {props.icon ? (
        <img className="mod-icon" src={props.icon} alt="" loading="lazy" style={{ width: 44, height: 44 }} />
      ) : (
        <span className="mod-icon" style={{ width: 44, height: 44 }}>
          <Package size={18} />
        </span>
      )}
      <div className="mod-meta">
        <div className="mod-title" style={{ fontSize: '0.88rem' }}>
          {props.title}
          <span className="author">by {props.author}</span>
        </div>
        <div className="mod-desc" style={{ WebkitLineClamp: 1 }}>{props.description}</div>
        <div className="mod-stats" style={{ marginTop: 5 }}>
          <span>
            <Download /> {formatCount(props.downloads)}
          </span>
          <span>{formatRelative(props.updated)}</span>
          {props.badges.map((c) => (
            <span key={c} className="badge" style={{ fontSize: '0.68rem' }}>
              {titleCase(c)}
            </span>
          ))}
        </div>
      </div>
      <div className="row" style={{ gap: 6 }} onClick={(e) => e.stopPropagation()}>
        {props.extra}
      </div>
      <span className="wz-pack-radio">{props.selected && <Check size={12} strokeWidth={3} />}</span>
    </div>
  )
}

// ------------------------------------------------------------ install stages

const PHASE_ORDER: ModpackProgress['phase'][] = ['preparing', 'manifest', 'files', 'overrides', 'verify', 'done']

const PHASE_LABELS: Record<string, string> = {
  preparing: 'Preparing profile',
  manifest: 'Downloading modpack manifest',
  files: 'Downloading required files',
  overrides: 'Installing configuration',
  verify: 'Verifying files',
  done: 'Ready to play'
}

function InstallProgressView({
  progress,
  packName
}: {
  progress: ModpackProgress | null
  packName: string
}): ReactNode {
  const currentIndex = progress ? PHASE_ORDER.indexOf(progress.phase) : 0
  return (
    <div className="wz-install">
      <span className="wz-install-icon">
        <Download size={26} />
      </span>
      <h2>Installing {packName}</h2>
      <p className="tiny">Large packs can take a few minutes. Progress also appears on the Downloads page.</p>
      <ol className="wz-install-steps">
        {PHASE_ORDER.map((phase, i) => {
          const isCurrent = i === currentIndex
          const isDone = i < currentIndex
          return (
            <li key={phase} className={isDone ? 'done' : isCurrent ? 'current' : ''}>
              <span className="wz-step-dot">
                {isDone ? (
                  <Check size={12} strokeWidth={3} />
                ) : isCurrent ? (
                  <span className="spinner" style={{ width: 12, height: 12 }} />
                ) : (
                  i + 1
                )}
              </span>
              <span>
                {PHASE_LABELS[phase]}
                {isCurrent && progress?.phase === 'files' ? (
                  <span className="tiny"> · {progress.detail.replace(/^Downloading files /, '')}</span>
                ) : null}
              </span>
            </li>
          )
        })}
      </ol>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <Progress value={progress?.phase === 'files' ? progress.progress : -1} />
      </div>
    </div>
  )
}
