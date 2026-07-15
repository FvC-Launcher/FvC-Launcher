import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  Eye,
  Package,
  PackageOpen,
  Search,
  Sparkles
} from 'lucide-react'
import { Button, Field, Input, Modal, Progress, Select, Toggle } from '@/components/ui'
import { formatCount, formatRelative, useApp } from '@/store'
import { LOADERS, LOADER_LABELS, PROFILE_ICONS, titleCase } from '@/lib'
import type {
  LoaderId,
  LoaderVersionInfo,
  McVersion,
  ModpackProgress,
  ModrinthSearchHit,
  ModrinthVersion
} from '@shared/types'

const STEPS = ['Name', 'Minecraft', 'Loader', 'Loader version', 'RAM', 'Content'] as const

const PACK_SORTS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'downloads', label: 'Most downloaded' },
  { value: 'follows', label: 'Most followed' },
  { value: 'newest', label: 'Newest' },
  { value: 'updated', label: 'Recently updated' }
]

export function ProfileWizard({ open, onClose }: { open: boolean; onClose: () => void }): ReactNode {
  const pushNotification = useApp((s) => s.pushNotification)
  const openProfile = useApp((s) => s.openProfile)
  const openProject = useApp((s) => s.openProject)
  const totalRamMb = useApp((s) => s.totalRamMb)

  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('Package')
  const [mcVersions, setMcVersions] = useState<McVersion[]>([])
  const [showSnapshots, setShowSnapshots] = useState(false)
  const [mcVersion, setMcVersion] = useState('')
  const [loader, setLoader] = useState<LoaderId>('vanilla')
  const [loaderVersions, setLoaderVersions] = useState<LoaderVersionInfo[] | null>(null)
  const [loaderVersion, setLoaderVersion] = useState('')
  const [ramMb, setRamMb] = useState(4096)
  const [creating, setCreating] = useState(false)

  // ---- Content step (empty profile vs modpack) ----
  const [contentMode, setContentMode] = useState<'empty' | 'modpack'>('empty')
  const [packQuery, setPackQuery] = useState('')
  const [packSort, setPackSort] = useState('downloads')
  const [packMcFilter, setPackMcFilter] = useState('')
  const [packLoaderFilter, setPackLoaderFilter] = useState('')
  const [packHits, setPackHits] = useState<ModrinthSearchHit[]>([])
  const [packLoading, setPackLoading] = useState(false)
  const [selectedPack, setSelectedPack] = useState<ModrinthSearchHit | null>(null)
  const [packVersions, setPackVersions] = useState<ModrinthVersion[] | null>(null)
  const [packVersionId, setPackVersionId] = useState('')
  const [installProgress, setInstallProgress] = useState<ModpackProgress | null>(null)

  // Reset on open.
  useEffect(() => {
    if (open) {
      setStep(0)
      setName('')
      setIcon('Package')
      setLoader('vanilla')
      setLoaderVersion('')
      setRamMb(4096)
      setContentMode('empty')
      setPackQuery('')
      setSelectedPack(null)
      setPackVersions(null)
      setPackVersionId('')
      setInstallProgress(null)
      setCreating(false)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    void window.fvc.versions
      .minecraft(showSnapshots)
      .then((versions) => {
        setMcVersions(versions)
        setMcVersion((current) => current || versions.find((v) => v.type === 'release')?.id || '')
      })
      .catch((err) =>
        pushNotification({ type: 'error', title: 'Could not load Minecraft versions', body: String(err) })
      )
  }, [open, showSnapshots, pushNotification])

  // Loader versions for the chosen loader + MC version.
  useEffect(() => {
    if (!open || loader === 'vanilla' || !mcVersion) return
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
  }, [open, loader, mcVersion])

  // Default modpack filters follow the earlier wizard choices.
  useEffect(() => {
    if (step === 5 && contentMode === 'modpack') {
      setPackMcFilter((f) => f || mcVersion)
      setPackLoaderFilter((f) => f || (loader !== 'vanilla' ? loader : ''))
    }
  }, [step, contentMode, mcVersion, loader])

  // Live modpack search.
  useEffect(() => {
    if (!open || step !== 5 || contentMode !== 'modpack') return
    setPackLoading(true)
    const timer = setTimeout(() => {
      window.fvc.modrinth
        .search({
          query: packQuery,
          projectType: 'modpack',
          gameVersion: packMcFilter || undefined,
          loader: packLoaderFilter || undefined,
          index: packSort as never,
          limit: 20
        })
        .then((result) => setPackHits(result.hits))
        .catch(() => setPackHits([]))
        .finally(() => setPackLoading(false))
    }, 300)
    return () => clearTimeout(timer)
  }, [open, step, contentMode, packQuery, packSort, packMcFilter, packLoaderFilter])

  // Versions of the selected pack.
  useEffect(() => {
    if (!selectedPack) return
    setPackVersions(null)
    setPackVersionId('')
    void window.fvc.modrinth
      .versions(selectedPack.project_id)
      .then((versions) => {
        setPackVersions(versions)
        if (versions[0]) setPackVersionId(versions[0].id)
      })
      .catch(() => setPackVersions([]))
  }, [selectedPack])

  // Staged install progress from the main process.
  useEffect(() => {
    if (!open) return
    return window.fvc.modpacks.onProgress(setInstallProgress)
  }, [open])

  const maxRam = Math.max(2048, totalRamMb - 2048)

  const canNext = useMemo(() => {
    switch (step) {
      case 0:
        return name.trim().length > 0
      case 1:
        return mcVersion !== ''
      case 3:
        return loader === 'vanilla' || loaderVersion !== ''
      default:
        return true
    }
  }, [step, name, mcVersion, loader, loaderVersion])

  const canCreate =
    contentMode === 'empty' || (selectedPack !== null && packVersionId !== '' && !packLoading)

  const next = (): void => {
    if (step === 2 && loader === 'vanilla') setStep(4)
    else setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }
  const back = (): void => {
    if (step === 4 && loader === 'vanilla') setStep(2)
    else setStep((s) => Math.max(s - 1, 0))
  }

  const create = async (): Promise<void> => {
    setCreating(true)
    try {
      if (contentMode === 'modpack' && selectedPack) {
        const profile = await window.fvc.modpacks.install({
          name: name.trim(),
          icon,
          ramMb,
          projectId: selectedPack.project_id,
          versionId: packVersionId
        })
        onClose()
        openProfile(profile.id)
      } else {
        const profile = await window.fvc.profiles.create({
          name: name.trim(),
          minecraftVersion: mcVersion,
          loader,
          loaderVersion: loader === 'vanilla' ? undefined : loaderVersion,
          ramMb,
          icon
        })
        pushNotification({ type: 'success', title: `${profile.name} created` })
        onClose()
        openProfile(profile.id)
      }
    } catch (err) {
      pushNotification({
        type: 'error',
        title: contentMode === 'modpack' ? 'Modpack installation failed' : 'Could not create profile',
        body: err instanceof Error ? err.message : String(err)
      })
      setInstallProgress(null)
    } finally {
      setCreating(false)
    }
  }

  const installing = creating && contentMode === 'modpack'

  return (
    <Modal
      open={open}
      onClose={() => !installing && onClose()}
      title="New profile"
      wide={step === 5 && contentMode === 'modpack'}
      footer={
        installing ? undefined : (
          <>
            {step > 0 && (
              <Button icon={ArrowLeft} onClick={back}>
                Back
              </Button>
            )}
            <div style={{ flex: 1 }} />
            {step < STEPS.length - 1 ? (
              <Button variant="primary" disabled={!canNext} onClick={next}>
                Next <ArrowRight size={15} />
              </Button>
            ) : (
              <Button
                variant="primary"
                icon={contentMode === 'modpack' ? Download : Sparkles}
                loading={creating}
                disabled={!canCreate}
                onClick={() => void create()}
              >
                {contentMode === 'modpack' ? 'Install modpack' : 'Create profile'}
              </Button>
            )}
          </>
        )
      }
    >
      <div className="modal-body" style={{ minHeight: 320 }}>
        {installing ? (
          <InstallProgressView progress={installProgress} packName={selectedPack?.title ?? name} />
        ) : (
          <>
            {/* Step indicator */}
            <div className="row" style={{ gap: 6 }}>
              {STEPS.map((label, i) => (
                <div key={label} className="row" style={{ gap: 6, flex: i < STEPS.length - 1 ? 1 : undefined }}>
                  <span
                    className="badge"
                    style={
                      i === step
                        ? { background: 'var(--accent)', color: '#06131a' }
                        : i < step
                          ? { background: 'rgba(var(--accent-rgb), 0.15)', color: 'var(--accent)' }
                          : undefined
                    }
                  >
                    {i < step ? <Check size={11} /> : i + 1}
                  </span>
                  {i < STEPS.length - 1 && (
                    <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
                  )}
                </div>
              ))}
            </div>
            <div className="tiny" style={{ textAlign: 'center' }}>
              Step {step + 1} of {STEPS.length}: {STEPS[step]}
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.18 }}
                className="stack"
                style={{ gap: 16 }}
              >
                {step === 0 && (
                  <>
                    <Field label="Profile name">
                      <Input
                        autoFocus
                        placeholder="My awesome modpack"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && canNext && next()}
                      />
                    </Field>
                    <Field label="Icon">
                      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                        {Object.entries(PROFILE_ICONS).map(([iconName, Icon]) => (
                          <button
                            key={iconName}
                            className="mod-icon"
                            style={{
                              width: 42,
                              height: 42,
                              cursor: 'pointer',
                              outline: icon === iconName ? '2px solid var(--accent)' : 'none',
                              color: icon === iconName ? 'var(--accent)' : undefined
                            }}
                            onClick={() => setIcon(iconName)}
                          >
                            <Icon size={19} />
                          </button>
                        ))}
                      </div>
                    </Field>
                  </>
                )}

                {step === 1 && (
                  <>
                    <Field label="Minecraft version">
                      <Select
                        value={mcVersion}
                        options={mcVersions.map((v) => ({
                          value: v.id,
                          label: v.id,
                          hint: v.type !== 'release' ? v.type : undefined
                        }))}
                        onChange={setMcVersion}
                      />
                    </Field>
                    <label className="row" style={{ gap: 10, cursor: 'pointer' }}>
                      <Toggle checked={showSnapshots} onChange={setShowSnapshots} />
                      <span style={{ fontSize: '0.86rem' }}>Show snapshots</span>
                    </label>
                  </>
                )}

                {step === 2 && (
                  <div className="stack" style={{ gap: 8 }}>
                    {LOADERS.map((id) => (
                      <button
                        key={id}
                        className="card hoverable row"
                        style={{
                          padding: 14,
                          gap: 12,
                          width: '100%',
                          textAlign: 'left',
                          outline: loader === id ? '2px solid var(--accent)' : 'none'
                        }}
                        onClick={() => setLoader(id)}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>{LOADER_LABELS[id]}</div>
                          <div className="tiny" style={{ marginTop: 2 }}>
                            {
                              {
                                vanilla: 'Pure Minecraft, no mod support',
                                fabric: 'Lightweight, fast updates, great performance mods',
                                forge: 'The classic loader with the largest mod catalog',
                                neoforge: 'Modern fork of Forge for recent Minecraft versions',
                                quilt: 'Fabric-compatible community fork'
                              }[id]
                            }
                          </div>
                        </div>
                        {loader === id && <Check size={17} style={{ color: 'var(--accent)' }} />}
                      </button>
                    ))}
                  </div>
                )}

                {step === 3 && (
                  <Field label={`${LOADER_LABELS[loader]} version for Minecraft ${mcVersion}`}>
                    {loaderVersions === null ? (
                      <div className="row" style={{ gap: 10, padding: 10 }}>
                        <span className="spinner" style={{ color: 'var(--accent)' }} />
                        <span className="muted" style={{ fontSize: '0.86rem' }}>
                          Loading versions…
                        </span>
                      </div>
                    ) : loaderVersions.length === 0 ? (
                      <div className="badge warning" style={{ alignSelf: 'flex-start' }}>
                        No {LOADER_LABELS[loader]} builds found for {mcVersion}
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
                  </Field>
                )}

                {step === 4 && (
                  <Field label="Allocated RAM">
                    <div className="row" style={{ gap: 14 }}>
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
                      <span style={{ minWidth: 70, textAlign: 'right', fontWeight: 700 }}>
                        {(ramMb / 1024).toFixed(1)} GB
                      </span>
                    </div>
                    <p className="tiny" style={{ marginTop: 6 }}>
                      4–6 GB is plenty for most modpacks. Leaving RAM for your system avoids stutters.
                    </p>
                  </Field>
                )}

                {step === 5 && (
                  <>
                    <div className="row" style={{ gap: 8 }}>
                      <button
                        className="card hoverable row"
                        style={{
                          flex: 1,
                          padding: 14,
                          gap: 12,
                          outline: contentMode === 'empty' ? '2px solid var(--accent)' : 'none'
                        }}
                        onClick={() => setContentMode('empty')}
                      >
                        <Package size={20} style={{ color: 'var(--accent)' }} />
                        <div style={{ textAlign: 'left' }}>
                          <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Empty profile</div>
                          <div className="tiny">Start clean, add mods later</div>
                        </div>
                      </button>
                      <button
                        className="card hoverable row"
                        style={{
                          flex: 1,
                          padding: 14,
                          gap: 12,
                          outline: contentMode === 'modpack' ? '2px solid var(--accent)' : 'none'
                        }}
                        onClick={() => setContentMode('modpack')}
                      >
                        <PackageOpen size={20} style={{ color: 'var(--accent)' }} />
                        <div style={{ textAlign: 'left' }}>
                          <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Install a modpack</div>
                          <div className="tiny">Complete packs from Modrinth</div>
                        </div>
                      </button>
                    </div>

                    {contentMode === 'empty' ? (
                      <div className="card" style={{ padding: 20 }}>
                        <h3 style={{ marginBottom: 12 }}>Summary</h3>
                        {[
                          ['Name', name],
                          ['Minecraft', mcVersion],
                          ['Loader', LOADER_LABELS[loader] + (loader !== 'vanilla' ? ` ${loaderVersion}` : '')],
                          ['RAM', `${(ramMb / 1024).toFixed(1)} GB`]
                        ].map(([k, v]) => (
                          <div key={k} className="row between" style={{ padding: '7px 0', fontSize: '0.88rem' }}>
                            <span className="muted">{k}</span>
                            <span style={{ fontWeight: 600 }}>{v}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <ModpackPicker
                        query={packQuery}
                        setQuery={setPackQuery}
                        sort={packSort}
                        setSort={setPackSort}
                        mcFilter={packMcFilter}
                        setMcFilter={setPackMcFilter}
                        loaderFilter={packLoaderFilter}
                        setLoaderFilter={setPackLoaderFilter}
                        mcVersions={mcVersions}
                        hits={packHits}
                        loading={packLoading}
                        selected={selectedPack}
                        onSelect={setSelectedPack}
                        onDetails={(hit) => openProject(hit.project_id, true)}
                        versions={packVersions}
                        versionId={packVersionId}
                        setVersionId={setPackVersionId}
                      />
                    )}
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </>
        )}
      </div>
    </Modal>
  )
}

// ------------------------------------------------------------ modpack picker

function ModpackPicker(props: {
  query: string
  setQuery: (v: string) => void
  sort: string
  setSort: (v: string) => void
  mcFilter: string
  setMcFilter: (v: string) => void
  loaderFilter: string
  setLoaderFilter: (v: string) => void
  mcVersions: McVersion[]
  hits: ModrinthSearchHit[]
  loading: boolean
  selected: ModrinthSearchHit | null
  onSelect: (hit: ModrinthSearchHit) => void
  onDetails: (hit: ModrinthSearchHit) => void
  versions: ModrinthVersion[] | null
  versionId: string
  setVersionId: (v: string) => void
}): ReactNode {
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row" style={{ gap: 8 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search
            size={15}
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}
          />
          <Input
            placeholder="Search modpacks on Modrinth…"
            value={props.query}
            onChange={(e) => props.setQuery(e.target.value)}
            style={{ paddingLeft: 36 }}
          />
        </div>
        <div style={{ width: 170 }}>
          <Select value={props.sort} options={PACK_SORTS} onChange={props.setSort} />
        </div>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <div style={{ width: 160 }}>
          <Select
            value={props.mcFilter}
            options={[
              { value: '', label: 'Any MC version' },
              ...props.mcVersions.slice(0, 60).map((v) => ({ value: v.id, label: v.id }))
            ]}
            onChange={props.setMcFilter}
          />
        </div>
        <div style={{ width: 160 }}>
          <Select
            value={props.loaderFilter}
            options={[
              { value: '', label: 'Any loader' },
              ...(['fabric', 'forge', 'neoforge', 'quilt'] as const).map((l) => ({
                value: l,
                label: LOADER_LABELS[l]
              }))
            ]}
            onChange={props.setLoaderFilter}
          />
        </div>
        <span className="tiny">The pack decides the final Minecraft version and loader.</span>
      </div>

      <div className="stack" style={{ gap: 8, maxHeight: 340, overflowY: 'auto', paddingRight: 4 }}>
        {props.loading ? (
          <div className="empty-state" style={{ padding: 30 }}>
            <span className="spinner" style={{ width: 24, height: 24, color: 'var(--accent)' }} />
          </div>
        ) : props.hits.length === 0 ? (
          <div className="empty-state" style={{ padding: 30 }}>
            <Package />
            <span style={{ fontSize: '0.86rem' }}>No modpacks found — try different filters.</span>
          </div>
        ) : (
          props.hits.map((hit) => {
            const isSelected = props.selected?.project_id === hit.project_id
            return (
              <div
                key={hit.project_id}
                className="card hoverable mod-row"
                style={{
                  alignItems: 'center',
                  cursor: 'pointer',
                  padding: 11,
                  outline: isSelected ? '2px solid var(--accent)' : 'none'
                }}
                onClick={() => props.onSelect(hit)}
              >
                {hit.icon_url ? (
                  <img className="mod-icon" src={hit.icon_url} alt="" loading="lazy" style={{ width: 44, height: 44 }} />
                ) : (
                  <span className="mod-icon" style={{ width: 44, height: 44 }}>
                    <Package size={18} />
                  </span>
                )}
                <div className="mod-meta">
                  <div className="mod-title" style={{ fontSize: '0.88rem' }}>
                    {hit.title}
                    <span className="author">by {hit.author}</span>
                  </div>
                  <div className="mod-desc" style={{ WebkitLineClamp: 1 }}>{hit.description}</div>
                  <div className="mod-stats" style={{ marginTop: 5 }}>
                    <span>
                      <Download /> {formatCount(hit.downloads)}
                    </span>
                    <span>{formatRelative(hit.date_modified)}</span>
                    {(hit.display_categories ?? hit.categories)?.slice(0, 2).map((c) => (
                      <span key={c} className="badge" style={{ fontSize: '0.68rem' }}>
                        {titleCase(c)}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="row" style={{ gap: 6 }} onClick={(e) => e.stopPropagation()}>
                  <Button variant="subtle" icon={Eye} onClick={() => props.onDetails(hit)} aria-label="Details" />
                  {isSelected && <Check size={17} style={{ color: 'var(--accent)' }} />}
                </div>
              </div>
            )
          })
        )}
      </div>

      {props.selected && (
        <Field label={`${props.selected.title} — version to install`}>
          {props.versions === null ? (
            <div className="row" style={{ gap: 10 }}>
              <span className="spinner" style={{ color: 'var(--accent)' }} />
              <span className="tiny">Loading versions…</span>
            </div>
          ) : (
            <Select
              value={props.versionId}
              options={props.versions.slice(0, 40).map((v) => ({
                value: v.id,
                label: v.name || v.version_number,
                hint: `${v.game_versions.slice(-1)[0] ?? ''} · ${v.loaders.join('/')}`
              }))}
              onChange={props.setVersionId}
            />
          )}
        </Field>
      )}
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
    <div className="stack" style={{ gap: 18, padding: '20px 4px', alignItems: 'center' }}>
      <h2 style={{ textAlign: 'center' }}>Installing {packName}…</h2>
      <div className="stack" style={{ gap: 10, width: '100%', maxWidth: 420 }}>
        {PHASE_ORDER.map((phase, i) => {
          const isCurrent = i === currentIndex
          const isDone = i < currentIndex
          return (
            <div key={phase} className="row" style={{ gap: 10, opacity: isDone || isCurrent ? 1 : 0.35 }}>
              {isDone ? (
                <Check size={15} style={{ color: 'var(--success)' }} />
              ) : isCurrent ? (
                <span className="spinner" style={{ width: 14, height: 14, color: 'var(--accent)' }} />
              ) : (
                <span style={{ width: 15 }} />
              )}
              <span style={{ fontSize: '0.88rem', fontWeight: isCurrent ? 600 : 400 }}>
                {PHASE_LABELS[phase]}
                {isCurrent && progress?.phase === 'files' ? ` — ${progress.detail.replace(/^Downloading files /, '')}` : ''}
              </span>
            </div>
          )
        })}
      </div>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <Progress value={progress?.phase === 'files' ? progress.progress : -1} />
      </div>
      <p className="tiny" style={{ textAlign: 'center' }}>
        Large packs can take a few minutes. Progress also appears on the Downloads page.
      </p>
    </div>
  )
}
