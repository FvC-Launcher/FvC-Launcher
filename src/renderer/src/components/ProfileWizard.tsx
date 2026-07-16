import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  Eye,
  ExternalLink,
  FileArchive,
  Package,
  PackageOpen,
  Search,
  Sparkles,
  Upload,
  X
} from 'lucide-react'
import { Button, Field, Input, Modal, Progress, Select, Toggle } from '@/components/ui'
import { formatCount, formatRelative, useApp } from '@/store'
import { LOADERS, LOADER_LABELS, PROFILE_ICONS, titleCase } from '@/lib'
import type {
  CurseForgePack,
  LoaderId,
  LoaderVersionInfo,
  McVersion,
  ModpackProgress,
  ModrinthSearchHit,
  ModrinthVersion
} from '@shared/types'

type WizardKind = 'empty' | 'modpack'
type PackSource = 'modrinth' | 'curseforge'

type PackSelection =
  | { type: 'modrinth'; hit: ModrinthSearchHit }
  | { type: 'curseforge'; pack: CurseForgePack }
  | { type: 'zip'; path: string }
  | null

const EMPTY_STEPS = ['Type', 'Name', 'Minecraft', 'Loader', 'Loader version', 'RAM'] as const
const MODPACK_STEPS = ['Type', 'Name', 'RAM', 'Modpack'] as const

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
  const [mcVersions, setMcVersions] = useState<McVersion[]>([])
  const [showSnapshots, setShowSnapshots] = useState(false)
  const [mcVersion, setMcVersion] = useState('')
  const [loader, setLoader] = useState<LoaderId>('vanilla')
  const [loaderVersions, setLoaderVersions] = useState<LoaderVersionInfo[] | null>(null)
  const [loaderVersion, setLoaderVersion] = useState('')
  const [ramMb, setRamMb] = useState(4096)
  const [creating, setCreating] = useState(false)

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

  const steps: readonly string[] = kind === 'modpack' ? MODPACK_STEPS : EMPTY_STEPS
  const stepName = steps[step]

  // Reset on open.
  useEffect(() => {
    if (open) {
      setKind('empty')
      setStep(0)
      setName('')
      setIcon('Package')
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
      void window.fvc.curseforge.hasApiKey().then(setHasCfKey)
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
    if (!open || stepName !== 'Modpack') return
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
  }, [open, stepName, source, packQuery, mrSort, cfSort, packMcFilter])

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

  const canNext = useMemo(() => {
    switch (stepName) {
      case 'Name':
        return name.trim().length > 0
      case 'Minecraft':
        return mcVersion !== ''
      case 'Loader version':
        return loaderVersion !== ''
      default:
        return true
    }
  }, [stepName, name, mcVersion, loaderVersion])

  const isLastStep = step === steps.length - 1
  const canCreate =
    kind === 'empty' ||
    (selection !== null &&
      (selection.type !== 'modrinth' || (packVersionId !== '' && packVersions !== null)))

  const next = (): void => {
    if (kind === 'empty' && stepName === 'Loader' && loader === 'vanilla') {
      setStep((s) => s + 2) // vanilla has no loader version
    } else {
      setStep((s) => Math.min(s + 1, steps.length - 1))
    }
  }
  const back = (): void => {
    if (kind === 'empty' && stepName === 'RAM' && loader === 'vanilla') {
      setStep((s) => s - 2)
    } else {
      setStep((s) => Math.max(s - 1, 0))
    }
  }

  const uploadZip = async (): Promise<void> => {
    const path = await window.fvc.curseforge.pickZip()
    if (path) setSelection({ type: 'zip', path })
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
            ramMb,
            projectId: selection.hit.project_id,
            versionId: packVersionId
          })
        } else if (selection.type === 'curseforge') {
          profile = await window.fvc.curseforge.install({
            name: name.trim(),
            icon,
            ramMb,
            modId: selection.pack.id
          })
        } else {
          profile = await window.fvc.curseforge.installZip({
            name: name.trim(),
            icon,
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
          icon
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

  const installing = creating && kind === 'modpack'
  const selectedPackName =
    selection?.type === 'modrinth'
      ? selection.hit.title
      : selection?.type === 'curseforge'
        ? selection.pack.name
        : selection?.type === 'zip'
          ? (selection.path.split(/[\\/]/).pop() ?? 'modpack')
          : name

  return (
    <Modal
      open={open}
      onClose={() => !installing && onClose()}
      title="New profile"
      wide={stepName === 'Modpack'}
      footer={
        installing ? undefined : (
          <>
            {step > 0 && (
              <Button icon={ArrowLeft} onClick={back}>
                Back
              </Button>
            )}
            <div style={{ flex: 1 }} />
            {!isLastStep ? (
              <Button variant="primary" disabled={!canNext} onClick={next}>
                Next <ArrowRight size={15} />
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
      <div className="modal-body" style={{ minHeight: 320 }}>
        {installing ? (
          <InstallProgressView progress={installProgress} packName={selectedPackName} />
        ) : (
          <>
            {/* Step indicator */}
            <div className="row" style={{ gap: 6 }}>
              {steps.map((label, i) => (
                <div key={label} className="row" style={{ gap: 6, flex: i < steps.length - 1 ? 1 : undefined }}>
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
                  {i < steps.length - 1 && (
                    <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
                  )}
                </div>
              ))}
            </div>
            <div className="tiny" style={{ textAlign: 'center' }}>
              Step {step + 1} of {steps.length}: {stepName}
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={`${kind}-${step}`}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.18 }}
                className="stack"
                style={{ gap: 16 }}
              >
                {stepName === 'Type' && (
                  <div className="stack" style={{ gap: 10 }}>
                    <button
                      className="card hoverable row"
                      style={{
                        padding: 18,
                        gap: 14,
                        width: '100%',
                        textAlign: 'left',
                        outline: kind === 'empty' ? '2px solid var(--accent)' : 'none'
                      }}
                      onClick={() => setKind('empty')}
                    >
                      <span className="mod-icon" style={{ width: 48, height: 48, color: 'var(--accent)' }}>
                        <Package size={22} />
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700 }}>Normal profile</div>
                        <div className="tiny" style={{ marginTop: 3, lineHeight: 1.4 }}>
                          Pick a Minecraft version and loader, start clean and add mods yourself.
                        </div>
                      </div>
                      {kind === 'empty' && <Check size={17} style={{ color: 'var(--accent)' }} />}
                    </button>
                    <button
                      className="card hoverable row"
                      style={{
                        padding: 18,
                        gap: 14,
                        width: '100%',
                        textAlign: 'left',
                        outline: kind === 'modpack' ? '2px solid var(--accent)' : 'none'
                      }}
                      onClick={() => setKind('modpack')}
                    >
                      <span className="mod-icon" style={{ width: 48, height: 48, color: 'var(--accent)' }}>
                        <PackageOpen size={22} />
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700 }}>Modpack</div>
                        <div className="tiny" style={{ marginTop: 3, lineHeight: 1.4 }}>
                          Install a complete pack from Modrinth or CurseForge — or import a CurseForge .zip.
                          The pack decides the Minecraft version and loader.
                        </div>
                      </div>
                      {kind === 'modpack' && <Check size={17} style={{ color: 'var(--accent)' }} />}
                    </button>
                  </div>
                )}

                {stepName === 'Name' && (
                  <>
                    <Field label="Profile name">
                      <Input
                        autoFocus
                        placeholder={kind === 'modpack' ? 'My modpack' : 'My awesome profile'}
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

                {stepName === 'Minecraft' && (
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

                {stepName === 'Loader' && (
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

                {stepName === 'Loader version' && (
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

                {stepName === 'RAM' && (
                  <>
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

                    {kind === 'empty' && (
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
                    )}
                  </>
                )}

                {stepName === 'Modpack' && (
                  <div className="stack" style={{ gap: 12 }}>
                    {/* Source switch */}
                    <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
                      <div className="tabs">
                        {(['modrinth', 'curseforge'] as const).map((s) => (
                          <button
                            key={s}
                            className={`tab ${source === s ? 'active' : ''}`}
                            onClick={() => {
                              setSource(s)
                              if (selection && selection.type !== 'zip') setSelection(null)
                            }}
                          >
                            {source === s && <span className="tab-bg" />}
                            {s === 'modrinth' ? 'Modrinth' : 'CurseForge'}
                          </button>
                        ))}
                      </div>
                      <div className="row" style={{ gap: 8 }}>
                        <div style={{ width: 150 }}>
                          <Select
                            value={packMcFilter}
                            options={[
                              { value: '', label: 'Any MC version' },
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

                    <div style={{ position: 'relative' }}>
                      <Search
                        size={15}
                        style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}
                      />
                      <Input
                        placeholder={`Search modpacks on ${source === 'modrinth' ? 'Modrinth' : 'CurseForge'}…`}
                        value={packQuery}
                        onChange={(e) => setPackQuery(e.target.value)}
                        style={{ paddingLeft: 36 }}
                      />
                    </div>

                    {/* Results */}
                    <div className="stack" style={{ gap: 8, maxHeight: 300, overflowY: 'auto', paddingRight: 4 }}>
                      {packLoading ? (
                        <div className="empty-state" style={{ padding: 26 }}>
                          <span className="spinner" style={{ width: 24, height: 24, color: 'var(--accent)' }} />
                        </div>
                      ) : source === 'curseforge' && cfError ? (
                        <div className="card" style={{ padding: 16 }}>
                          <div className="row" style={{ gap: 10 }}>
                            <span className="badge warning">CurseForge</span>
                            <span style={{ fontSize: '0.86rem', lineHeight: 1.5 }}>{cfError}</span>
                          </div>
                          {!hasCfKey && (
                            <p className="tiny" style={{ marginTop: 8, lineHeight: 1.5 }}>
                              You can still import a CurseForge modpack .zip with the button below — no key needed.
                            </p>
                          )}
                        </div>
                      ) : source === 'modrinth' ? (
                        mrHits.length === 0 ? (
                          <div className="empty-state" style={{ padding: 26 }}>
                            <Package />
                            <span style={{ fontSize: '0.86rem' }}>No modpacks found.</span>
                          </div>
                        ) : (
                          mrHits.map((hit) => {
                            const isSelected =
                              selection?.type === 'modrinth' && selection.hit.project_id === hit.project_id
                            return (
                              <PackRow
                                key={hit.project_id}
                                icon={hit.icon_url}
                                title={hit.title}
                                author={hit.author}
                                description={hit.description}
                                downloads={hit.downloads}
                                updated={hit.date_modified}
                                badges={(hit.display_categories ?? hit.categories)?.slice(0, 2) ?? []}
                                selected={!!isSelected}
                                onSelect={() => setSelection({ type: 'modrinth', hit })}
                                extra={
                                  <Button
                                    variant="subtle"
                                    icon={Eye}
                                    onClick={() => openProject(hit.project_id, true)}
                                    aria-label="Details"
                                  />
                                }
                              />
                            )
                          })
                        )
                      ) : cfHits.length === 0 ? (
                        <div className="empty-state" style={{ padding: 26 }}>
                          <Package />
                          <span style={{ fontSize: '0.86rem' }}>No modpacks found.</span>
                        </div>
                      ) : (
                        cfHits.map((pack) => {
                          const isSelected = selection?.type === 'curseforge' && selection.pack.id === pack.id
                          return (
                            <PackRow
                              key={pack.id}
                              icon={pack.logoUrl}
                              title={pack.name}
                              author={pack.author}
                              description={pack.summary}
                              downloads={pack.downloads}
                              updated={pack.dateModified}
                              badges={pack.categories.slice(0, 2)}
                              selected={!!isSelected}
                              onSelect={() => setSelection({ type: 'curseforge', pack })}
                              extra={
                                pack.websiteUrl ? (
                                  <Button
                                    variant="subtle"
                                    icon={ExternalLink}
                                    onClick={() => window.fvc.system.openExternal(pack.websiteUrl!)}
                                    aria-label="Open on CurseForge"
                                  />
                                ) : undefined
                              }
                            />
                          )
                        })
                      )}
                    </div>

                    {/* Modrinth version picker */}
                    {selection?.type === 'modrinth' && (
                      <Field label={`${selection.hit.title} — version to install`}>
                        {packVersions === null ? (
                          <div className="row" style={{ gap: 10 }}>
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
                      </Field>
                    )}

                    {/* Center: upload a CurseForge zip */}
                    <div className="row" style={{ gap: 12, alignItems: 'center' }}>
                      <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
                      <span className="tiny">or</span>
                      <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      {selection?.type === 'zip' ? (
                        <div
                          className="card row"
                          style={{ padding: '10px 16px', gap: 10, outline: '2px solid var(--accent)' }}
                        >
                          <FileArchive size={17} style={{ color: 'var(--accent)' }} />
                          <span style={{ fontSize: '0.88rem', fontWeight: 600, maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {selection.path.split(/[\\/]/).pop()}
                          </span>
                          <Button variant="subtle" icon={X} onClick={() => setSelection(null)} aria-label="Remove file" />
                        </div>
                      ) : (
                        <Button icon={Upload} onClick={() => void uploadZip()}>
                          Upload CurseForge modpack (.zip)
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </>
        )}
      </div>
    </Modal>
  )
}

// ------------------------------------------------------------ pack result row

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
    <div
      className="card hoverable mod-row"
      style={{
        alignItems: 'center',
        cursor: 'pointer',
        padding: 11,
        outline: props.selected ? '2px solid var(--accent)' : 'none'
      }}
      onClick={props.onSelect}
    >
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
        {props.selected && <Check size={17} style={{ color: 'var(--accent)' }} />}
      </div>
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
