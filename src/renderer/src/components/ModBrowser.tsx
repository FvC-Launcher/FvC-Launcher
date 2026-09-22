import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Calendar,
  Check,
  Download,
  Heart,
  LayoutGrid,
  List,
  Package,
  RotateCcw,
  Rows3,
  Search,
  SlidersHorizontal,
  X,
  type LucideIcon
} from 'lucide-react'
import { Button, EmptyState, Input, Select, Toggle } from '@/components/ui'
import { formatCount, formatRelative, useApp } from '@/store'
import { CATEGORY_GROUPS, KIND_LABELS, LOADER_LABELS, titleCase } from '@/lib'
import {
  DEFAULT_MOD_BROWSER,
  type ContentKind,
  type ModBrowserPrefs,
  type ModrinthSearchHit,
  type Profile
} from '@shared/types'

const SORT_OPTIONS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'downloads', label: 'Downloads' },
  { value: 'follows', label: 'Followers' },
  { value: 'newest', label: 'Newest' },
  { value: 'updated', label: 'Recently updated' }
]

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100].map((n) => ({ value: String(n), label: `${n} per page` }))

const VIEWS: { id: ModBrowserPrefs['view']; icon: LucideIcon; label: string }[] = [
  { id: 'list', icon: List, label: 'List' },
  { id: 'grid', icon: LayoutGrid, label: 'Grid' },
  { id: 'compact', icon: Rows3, label: 'Compact' }
]

type Environment = '' | 'client' | 'server'

export function ModBrowser({
  kind,
  profile,
  installedProjectIds,
  onInstalled
}: {
  kind: ContentKind
  /** Target profile for installs; compatibility filters follow it. */
  profile: Profile | null
  installedProjectIds?: Set<string>
  onInstalled?: () => void
}): ReactNode {
  const pushNotification = useApp((s) => s.pushNotification)
  const openProject = useApp((s) => s.openProject)
  const setSettings = useApp((s) => s.setSettings)
  const storedPrefs = useApp((s) => s.settings.modBrowser)
  const prefs: ModBrowserPrefs = { ...DEFAULT_MOD_BROWSER, ...storedPrefs }
  const setPrefs = (patch: Partial<ModBrowserPrefs>): void =>
    void setSettings({ modBrowser: { ...prefs, ...patch } })

  const [query, setQuery] = useState('')
  const [categories, setCategories] = useState<string[]>([])
  const [environment, setEnvironment] = useState<Environment>('')
  const [showFilters, setShowFilters] = useState(false)
  const [hits, setHits] = useState<ModrinthSearchHit[]>([])
  const [totalHits, setTotalHits] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState<Set<string>>(new Set())
  const [installed, setInstalled] = useState<Set<string>>(new Set())
  const requestSeq = useRef(0)

  // Category slugs differ per content kind.
  useEffect(() => {
    setCategories([])
    setEnvironment('')
  }, [kind])

  const projectType = kind === 'shaderpack' ? 'shader' : kind === 'resourcepack' ? 'resourcepack' : 'mod'
  const filterByProfile = prefs.compatibleOnly && !!profile
  const { sort, pageSize } = prefs

  const search = useCallback(
    async (nextOffset: number, append: boolean) => {
      const seq = ++requestSeq.current
      setLoading(!append)
      try {
        const result = await window.fvc.modrinth.search({
          query,
          projectType,
          gameVersion: filterByProfile ? profile?.minecraftVersion : undefined,
          loader:
            filterByProfile && kind === 'mod' && profile && profile.loader !== 'vanilla'
              ? profile.loader
              : undefined,
          categories: categories.length ? categories : undefined,
          environment: kind === 'mod' && environment ? environment : undefined,
          index: sort,
          offset: nextOffset,
          limit: pageSize
        })
        if (seq !== requestSeq.current) return // stale response
        setHits((prev) => (append ? [...prev, ...result.hits] : result.hits))
        setTotalHits(result.total_hits)
        setOffset(nextOffset)
      } catch (err) {
        if (seq === requestSeq.current) {
          pushNotification({
            type: 'error',
            title: 'Search failed',
            body: err instanceof Error ? err.message : String(err)
          })
        }
      } finally {
        if (seq === requestSeq.current) setLoading(false)
      }
    },
    [query, sort, pageSize, categories, environment, filterByProfile, projectType, kind, profile, pushNotification]
  )

  // Live search with debounce.
  useEffect(() => {
    const timer = setTimeout(() => void search(0, false), query ? 300 : 0)
    return () => clearTimeout(timer)
  }, [search, query])

  const install = async (hit: ModrinthSearchHit): Promise<void> => {
    if (!profile) {
      pushNotification({
        type: 'warning',
        title: 'No profile selected',
        body: 'Create or select a profile first, then install content into it.'
      })
      return
    }
    setInstalling((s) => new Set(s).add(hit.project_id))
    try {
      await window.fvc.modrinth.install(profile.id, kind, hit.project_id)
      setInstalled((s) => new Set(s).add(hit.project_id))
      pushNotification({
        type: 'success',
        title: `${hit.title} installed`,
        body: `Added to ${profile.name} with required dependencies.`
      })
      onInstalled?.()
    } catch (err) {
      pushNotification({
        type: 'error',
        title: `Could not install ${hit.title}`,
        body: err instanceof Error ? err.message : String(err)
      })
    } finally {
      setInstalling((s) => {
        const next = new Set(s)
        next.delete(hit.project_id)
        return next
      })
    }
  }

  const isInstalled = (id: string): boolean => installed.has(id) || !!installedProjectIds?.has(id)
  const visible = prefs.hideInstalled ? hits.filter((h) => !isInstalled(h.project_id)) : hits

  const toggleCategory = (slug: string): void =>
    setCategories((cur) => (cur.includes(slug) ? cur.filter((c) => c !== slug) : [...cur, slug]))

  const activeFilters =
    categories.length +
    (environment ? 1 : 0) +
    (prefs.compatibleOnly ? 0 : 1) +
    (prefs.hideInstalled ? 1 : 0)

  const resetFilters = (): void => {
    setCategories([])
    setEnvironment('')
    setPrefs({ compatibleOnly: true, hideInstalled: false })
  }

  const installButton = (hit: ModrinthSearchHit, small?: boolean): ReactNode => {
    const done = isInstalled(hit.project_id)
    return (
      <div onClick={(e) => e.stopPropagation()}>
        <Button
          variant={done ? 'ghost' : 'primary'}
          icon={done ? Check : Download}
          loading={installing.has(hit.project_id)}
          disabled={done}
          onClick={() => void install(hit)}
          className={small ? 'btn-sm' : ''}
        >
          {done ? 'Installed' : 'Install'}
        </Button>
      </div>
    )
  }

  const icon = (hit: ModrinthSearchHit, size: number): ReactNode =>
    hit.icon_url ? (
      <img className="mod-icon" src={hit.icon_url} alt="" loading="lazy" style={{ width: size, height: size }} />
    ) : (
      <span className="mod-icon" style={{ width: size, height: size }}>
        <Package size={size * 0.4} />
      </span>
    )

  const tags = (hit: ModrinthSearchHit): string[] => (hit.display_categories ?? hit.categories ?? []).slice(0, 3)

  const renderHit = (hit: ModrinthSearchHit): ReactNode => {
    const common = {
      initial: { opacity: 0, y: 8 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.2 },
      onClick: () => openProject(hit.project_id)
    }

    if (prefs.view === 'compact') {
      return (
        <motion.div key={hit.project_id} {...common} className="card hoverable mb-compact-row">
          {icon(hit, 32)}
          <div className="mb-compact-title">
            <span>{hit.title}</span>
            <span className="author">by {hit.author}</span>
          </div>
          <span className="mb-compact-stat">
            <Download size={12} /> {formatCount(hit.downloads)}
          </span>
          <span className="mb-compact-stat">
            <Calendar size={12} /> {formatRelative(hit.date_modified)}
          </span>
          {installButton(hit, true)}
        </motion.div>
      )
    }

    if (prefs.view === 'grid') {
      return (
        <motion.div key={hit.project_id} {...common} className="card hoverable mb-grid-card">
          <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
            {icon(hit, 48)}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="mb-grid-title">{hit.title}</div>
              <div className="tiny">by {hit.author}</div>
            </div>
          </div>
          <p className="mb-grid-desc">{hit.description}</p>
          <div className="mb-tags">
            {tags(hit).map((cat) => (
              <span key={cat} className="badge">
                {titleCase(cat)}
              </span>
            ))}
          </div>
          <div className="mb-grid-foot">
            <div className="mb-grid-stats tiny">
              <span>
                <Download size={12} /> {formatCount(hit.downloads)}
              </span>
              <span>
                <Heart size={12} /> {formatCount(hit.follows)}
              </span>
            </div>
            {installButton(hit, true)}
          </div>
        </motion.div>
      )
    }

    return (
      <motion.div key={hit.project_id} {...common} className="card hoverable mod-row" style={{ cursor: 'pointer' }}>
        {icon(hit, 56)}
        <div className="mod-meta">
          <div className="mod-title">
            {hit.title}
            <span className="author">by {hit.author}</span>
          </div>
          <div className="mod-desc">{hit.description}</div>
          <div className="mod-stats">
            <span>
              <Download /> {formatCount(hit.downloads)}
            </span>
            <span>
              <Heart /> {formatCount(hit.follows)}
            </span>
            <span>
              <Calendar /> {formatRelative(hit.date_modified)}
            </span>
            {tags(hit).map((cat) => (
              <span key={cat} className="badge">
                {titleCase(cat)}
              </span>
            ))}
          </div>
        </div>
        {installButton(hit)}
      </motion.div>
    )
  }

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row" style={{ gap: 10 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: 13,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-3)'
            }}
          />
          <Input
            placeholder={`Search ${KIND_LABELS[kind].plural.toLowerCase()} on Modrinth…`}
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
        <div style={{ width: 190 }}>
          <Select
            value={sort}
            options={SORT_OPTIONS}
            onChange={(v) => setPrefs({ sort: v as ModBrowserPrefs['sort'] })}
          />
        </div>
        <div className="segmented" role="radiogroup" aria-label="Layout">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              role="radio"
              aria-checked={prefs.view === v.id}
              title={v.label}
              className={prefs.view === v.id ? 'active' : ''}
              onClick={() => setPrefs({ view: v.id })}
            >
              <v.icon size={16} />
            </button>
          ))}
        </div>
        <Button
          icon={SlidersHorizontal}
          variant={showFilters || activeFilters ? 'primary' : 'ghost'}
          onClick={() => setShowFilters((v) => !v)}
        >
          Filters{activeFilters ? ` · ${activeFilters}` : ''}
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {showFilters && (
          <motion.div
            className="card mb-filters"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="mb-filters-inner">
              {CATEGORY_GROUPS[kind].map((group) => (
                <div key={group.label} className="mb-filter-group">
                  <div className="mb-filter-label">{group.label}</div>
                  <div className="mb-chips">
                    {group.items.map((slug) => (
                      <button
                        key={slug}
                        className={`mb-chip ${categories.includes(slug) ? 'on' : ''}`}
                        onClick={() => toggleCategory(slug)}
                      >
                        {categories.includes(slug) && <Check size={12} />}
                        {titleCase(slug)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              <div className="mb-options">
                {kind === 'mod' && (
                  <div className="mb-option">
                    <span className="mb-filter-label">Environment</span>
                    <div className="segmented">
                      {(
                        [
                          ['', 'Any'],
                          ['client', 'Client'],
                          ['server', 'Server']
                        ] as [Environment, string][]
                      ).map(([id, label]) => (
                        <button
                          key={id || 'any'}
                          className={environment === id ? 'active' : ''}
                          onClick={() => setEnvironment(id)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mb-option">
                  <span className="mb-filter-label">Results</span>
                  <div style={{ width: 150 }}>
                    <Select
                      value={String(pageSize)}
                      options={PAGE_SIZE_OPTIONS}
                      onChange={(v) => setPrefs({ pageSize: Number(v) })}
                    />
                  </div>
                </div>
                <label className="mb-option mb-switch">
                  <Toggle
                    checked={prefs.compatibleOnly}
                    onChange={(v) => setPrefs({ compatibleOnly: v })}
                    disabled={!profile}
                  />
                  <span>
                    Only compatible
                    {profile && (
                      <span className="tiny" style={{ display: 'block' }}>
                        Minecraft {profile.minecraftVersion}
                        {kind === 'mod' && profile.loader !== 'vanilla' ? ` · ${LOADER_LABELS[profile.loader]}` : ''}
                      </span>
                    )}
                  </span>
                </label>
                <label className="mb-option mb-switch">
                  <Toggle checked={prefs.hideInstalled} onChange={(v) => setPrefs({ hideInstalled: v })} />
                  <span>Hide installed</span>
                </label>
                <Button
                  variant="subtle"
                  icon={RotateCcw}
                  disabled={!activeFilters}
                  onClick={resetFilters}
                  style={{ marginLeft: 'auto' }}
                >
                  Reset
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!loading && (
        <div className="mb-summary">
          <span className="tiny">
            {formatCount(totalHits)} {totalHits === 1 ? 'result' : 'results'}
            {filterByProfile && profile
              ? ` for Minecraft ${profile.minecraftVersion}${
                  kind === 'mod' && profile.loader !== 'vanilla' ? ` · ${LOADER_LABELS[profile.loader]}` : ''
                }`
              : ''}
          </span>
          {categories.map((slug) => (
            <button key={slug} className="mb-chip on small" onClick={() => toggleCategory(slug)}>
              {titleCase(slug)} <X size={11} />
            </button>
          ))}
          {environment && (
            <button className="mb-chip on small" onClick={() => setEnvironment('')}>
              {environment === 'client' ? 'Client' : 'Server'} <X size={11} />
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="empty-state">
          <span className="spinner" style={{ width: 28, height: 28, color: 'var(--accent)' }} />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Nothing found"
          hint="Try a different search term or loosen the filters."
        />
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          <div className={`mb-results mb-${prefs.view}`}>{visible.map(renderHit)}</div>
          {hits.length < totalHits && (
            <Button onClick={() => void search(offset + pageSize, true)} style={{ alignSelf: 'center' }}>
              Load more ({formatCount(totalHits - hits.length)} remaining)
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
