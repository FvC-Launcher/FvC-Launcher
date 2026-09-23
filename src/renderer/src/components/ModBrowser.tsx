import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { motion } from 'framer-motion'
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
import { Button, EmptyState, Select, Toggle } from '@/components/ui'
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
  { value: 'downloads', label: 'Most downloaded' },
  { value: 'follows', label: 'Most followed' },
  { value: 'newest', label: 'Newest' },
  { value: 'updated', label: 'Recently updated' }
]

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100].map((n) => ({ value: String(n), label: `${n} per page` }))

const VIEWS: { id: ModBrowserPrefs['view']; icon: LucideIcon; label: string }[] = [
  { id: 'grid', icon: LayoutGrid, label: 'Grid' },
  { id: 'list', icon: List, label: 'List' },
  { id: 'compact', icon: Rows3, label: 'Compact' }
]

type Environment = '' | 'client' | 'server'

/** A screenshot for the card banner, if the project has any. */
function bannerImage(hit: ModrinthSearchHit): string | undefined {
  return hit.featured_gallery || hit.gallery?.[0] || undefined
}

function brandColor(hit: ModrinthSearchHit): string | undefined {
  return typeof hit.color === 'number' ? `#${hit.color.toString(16).padStart(6, '0')}` : undefined
}

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
  const [loadingMore, setLoadingMore] = useState(false)
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
  const noun = KIND_LABELS[kind].plural.toLowerCase()

  const search = useCallback(
    async (nextOffset: number, append: boolean) => {
      const seq = ++requestSeq.current
      if (append) setLoadingMore(true)
      else setLoading(true)
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
        if (seq === requestSeq.current) {
          setLoading(false)
          setLoadingMore(false)
        }
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
    categories.length + (environment ? 1 : 0) + (prefs.compatibleOnly ? 0 : 1) + (prefs.hideInstalled ? 1 : 0)

  const resetFilters = (): void => {
    setCategories([])
    setEnvironment('')
    setPrefs({ compatibleOnly: true, hideInstalled: false })
  }

  const installButton = (hit: ModrinthSearchHit, size: 'sm' | 'md' = 'md'): ReactNode => {
    const done = isInstalled(hit.project_id)
    return (
      <div onClick={(e) => e.stopPropagation()}>
        <Button
          variant={done ? 'ghost' : 'primary'}
          icon={done ? Check : Download}
          loading={installing.has(hit.project_id)}
          disabled={done}
          onClick={() => void install(hit)}
          className={`mb-install ${size === 'sm' ? 'btn-sm' : ''} ${done ? 'done' : ''}`}
        >
          {done ? 'Installed' : 'Install'}
        </Button>
      </div>
    )
  }

  const icon = (hit: ModrinthSearchHit, size: number, className = ''): ReactNode =>
    hit.icon_url ? (
      <img
        className={`mod-icon ${className}`}
        src={hit.icon_url}
        alt=""
        loading="lazy"
        style={{ width: size, height: size }}
      />
    ) : (
      <span className={`mod-icon ${className}`} style={{ width: size, height: size }}>
        <Package size={size * 0.4} />
      </span>
    )

  const tags = (hit: ModrinthSearchHit, n = 3): string[] => (hit.display_categories ?? hit.categories ?? []).slice(0, n)

  const renderHit = (hit: ModrinthSearchHit, index: number): ReactNode => {
    const done = isInstalled(hit.project_id)
    const common = {
      initial: { opacity: 0, y: 8 },
      animate: { opacity: 1, y: 0 },
      // Stagger only the first screenful; appended pages shouldn't wait.
      transition: { duration: 0.2, delay: Math.min(index % pageSize, 12) * 0.015 },
      onClick: () => openProject(hit.project_id)
    }

    if (prefs.view === 'compact') {
      return (
        <motion.div key={hit.project_id} {...common} className={`mb-compact-row ${done ? 'installed' : ''}`}>
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
          {installButton(hit, 'sm')}
        </motion.div>
      )
    }

    const image = bannerImage(hit)
    const color = brandColor(hit)

    if (prefs.view === 'grid') {
      const bannerStyle: CSSProperties = image
        ? { backgroundImage: `url("${image}")` }
        : { ['--brand' as never]: color ?? 'var(--accent)' }
      return (
        <motion.div key={hit.project_id} {...common} className={`mb-card ${done ? 'installed' : ''}`}>
          <div className={`mb-card-banner ${image ? 'has-image' : ''}`} style={bannerStyle}>
            {!image && hit.icon_url && <img className="mb-card-banner-blur" src={hit.icon_url} alt="" loading="lazy" />}
            {done && (
              <span className="mb-card-flag">
                <Check size={11} strokeWidth={3} /> Installed
              </span>
            )}
          </div>
          <div className="mb-card-body">
            <div className="mb-card-head">
              {icon(hit, 48, 'mb-card-icon')}
              <div style={{ minWidth: 0 }}>
                <div className="mb-card-title" title={hit.title}>
                  {hit.title}
                </div>
                <div className="tiny mb-ellipsis">by {hit.author}</div>
              </div>
            </div>
            <p className="mb-card-desc">{hit.description}</p>
            <div className="mb-tags">
              {tags(hit, 2).map((cat) => (
                <span key={cat} className="mb-tag">
                  {titleCase(cat)}
                </span>
              ))}
            </div>
            <div className="mb-card-foot">
              <div className="mb-card-stats">
                <span title="Downloads">
                  <Download size={12} /> {formatCount(hit.downloads)}
                </span>
                <span title="Followers">
                  <Heart size={12} /> {formatCount(hit.follows)}
                </span>
              </div>
              {installButton(hit, 'sm')}
            </div>
          </div>
        </motion.div>
      )
    }

    return (
      <motion.div key={hit.project_id} {...common} className={`mb-row ${done ? 'installed' : ''}`}>
        {icon(hit, 56)}
        <div className="mb-row-main">
          <div className="mb-row-title">
            <span className="mb-ellipsis">{hit.title}</span>
            <span className="author">by {hit.author}</span>
          </div>
          <div className="mb-row-desc">{hit.description}</div>
          <div className="mb-row-stats">
            <span>
              <Download size={13} /> {formatCount(hit.downloads)}
            </span>
            <span>
              <Heart size={13} /> {formatCount(hit.follows)}
            </span>
            <span>
              <Calendar size={13} /> {formatRelative(hit.date_modified)}
            </span>
            {tags(hit).map((cat) => (
              <span key={cat} className="mb-tag">
                {titleCase(cat)}
              </span>
            ))}
          </div>
        </div>
        {image && kind !== 'mod' && (
          <span className="mb-row-shot" style={{ backgroundImage: `url("${image}")` }} />
        )}
        {installButton(hit)}
      </motion.div>
    )
  }

  const filters = (
    <aside className={`mb-side ${showFilters ? 'open' : ''}`}>
      <div className="mb-side-block">
        <div className="mb-filter-label">Show</div>
        <label className="mb-switch">
          <span>
            Only compatible
            {profile && (
              <span className="tiny">
                {profile.minecraftVersion}
                {kind === 'mod' && profile.loader !== 'vanilla' ? ` · ${LOADER_LABELS[profile.loader]}` : ''}
              </span>
            )}
          </span>
          <Toggle
            checked={prefs.compatibleOnly}
            onChange={(v) => setPrefs({ compatibleOnly: v })}
            disabled={!profile}
          />
        </label>
        <label className="mb-switch">
          <span>Hide installed</span>
          <Toggle checked={prefs.hideInstalled} onChange={(v) => setPrefs({ hideInstalled: v })} />
        </label>
      </div>

      {kind === 'mod' && (
        <div className="mb-side-block">
          <div className="mb-filter-label">Environment</div>
          <div className="segmented mb-env">
            {(
              [
                ['', 'Any'],
                ['client', 'Client'],
                ['server', 'Server']
              ] as [Environment, string][]
            ).map(([id, label]) => (
              <button key={id || 'any'} className={environment === id ? 'active' : ''} onClick={() => setEnvironment(id)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {CATEGORY_GROUPS[kind].map((group) => (
        <div key={group.label} className="mb-side-block">
          <div className="mb-filter-label">{group.label}</div>
          <div className="mb-checks">
            {group.items.map((slug) => {
              const on = categories.includes(slug)
              return (
                <button key={slug} className={`mb-check ${on ? 'on' : ''}`} onClick={() => toggleCategory(slug)}>
                  <span className="mb-check-box">{on && <Check size={11} strokeWidth={3} />}</span>
                  {titleCase(slug)}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      <div className="mb-side-block">
        <div className="mb-filter-label">Results per page</div>
        <Select
          value={String(pageSize)}
          options={PAGE_SIZE_OPTIONS}
          onChange={(v) => setPrefs({ pageSize: Number(v) })}
        />
      </div>

      <Button variant="subtle" icon={RotateCcw} disabled={!activeFilters} onClick={resetFilters}>
        Reset filters
      </Button>
    </aside>
  )

  return (
    <div className="mb">
      {/* ------------------------------------------------------------ Toolbar */}
      <div className="mb-toolbar">
        <div className="pf-search mb-search">
          <Search size={16} />
          <input
            className="input"
            placeholder={`Search ${noun} on Modrinth…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
            style={{ paddingLeft: 38, paddingRight: query ? 36 : undefined }}
          />
          {query && (
            <button className="mb-clear" onClick={() => setQuery('')} title="Clear search">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="mb-sort">
          <Select value={sort} options={SORT_OPTIONS} onChange={(v) => setPrefs({ sort: v as ModBrowserPrefs['sort'] })} />
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
          className="mb-filter-toggle"
          variant={showFilters || activeFilters ? 'primary' : 'ghost'}
          onClick={() => setShowFilters((v) => !v)}
        >
          Filters{activeFilters ? ` · ${activeFilters}` : ''}
        </Button>
      </div>

      <div className="mb-layout">
        {filters}

        <div className="mb-main">
          <div className="mb-summary">
            <span className="mb-count">
              {loading ? (
                'Searching…'
              ) : (
                <>
                  <strong>{formatCount(totalHits)}</strong> {totalHits === 1 ? KIND_LABELS[kind].singular.toLowerCase() : noun}
                  {filterByProfile && profile ? (
                    <span className="tiny">
                      {' '}
                      for {profile.minecraftVersion}
                      {kind === 'mod' && profile.loader !== 'vanilla' ? ` · ${LOADER_LABELS[profile.loader]}` : ''}
                    </span>
                  ) : null}
                </>
              )}
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
            {activeFilters > 1 && (
              <button className="mb-clear-all" onClick={resetFilters}>
                Clear all
              </button>
            )}
          </div>

          {loading ? (
            <div className={`mb-results mb-${prefs.view}`}>
              {Array.from({ length: prefs.view === 'grid' ? 8 : 6 }, (_, i) => (
                <div key={i} className={`mb-skeleton ${prefs.view}`} />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <EmptyState
              icon={Package}
              title={`No ${noun} found`}
              hint="Try a different search term or loosen the filters."
              action={activeFilters ? <Button onClick={resetFilters}>Reset filters</Button> : undefined}
            />
          ) : (
            <div className="stack" style={{ gap: 16 }}>
              <div className={`mb-results mb-${prefs.view}`}>{visible.map(renderHit)}</div>
              {hits.length < totalHits && (
                <Button
                  loading={loadingMore}
                  onClick={() => void search(offset + pageSize, true)}
                  style={{ alignSelf: 'center' }}
                >
                  Load more · {formatCount(totalHits - hits.length)} left
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
