import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import {
  Calendar,
  Check,
  Download,
  Heart,
  Package,
  Search,
  SlidersHorizontal
} from 'lucide-react'
import { Button, EmptyState, Input, Select } from '@/components/ui'
import { formatCount, formatRelative, useApp } from '@/store'
import { KIND_LABELS, LOADER_LABELS, MOD_CATEGORIES, titleCase } from '@/lib'
import type { ContentKind, ModrinthSearchHit, Profile } from '@shared/types'

const SORT_OPTIONS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'downloads', label: 'Downloads' },
  { value: 'follows', label: 'Followers' },
  { value: 'newest', label: 'Newest' },
  { value: 'updated', label: 'Recently updated' }
]

const PAGE_SIZE = 20

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

  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('relevance')
  const [category, setCategory] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [hits, setHits] = useState<ModrinthSearchHit[]>([])
  const [totalHits, setTotalHits] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState<Set<string>>(new Set())
  const [installed, setInstalled] = useState<Set<string>>(new Set())
  const requestSeq = useRef(0)

  const projectType = kind === 'shaderpack' ? 'shader' : kind === 'resourcepack' ? 'resourcepack' : 'mod'

  const search = useCallback(
    async (nextOffset: number, append: boolean) => {
      const seq = ++requestSeq.current
      setLoading(!append)
      try {
        const result = await window.fvc.modrinth.search({
          query,
          projectType,
          gameVersion: profile?.minecraftVersion,
          loader: kind === 'mod' && profile && profile.loader !== 'vanilla' ? profile.loader : undefined,
          categories: category ? [category] : undefined,
          index: sort as never,
          offset: nextOffset,
          limit: PAGE_SIZE
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
    [query, sort, category, projectType, kind, profile, pushNotification]
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

  const categoryOptions = useMemo(
    () => [
      { value: '', label: 'All categories' },
      ...MOD_CATEGORIES.map((c) => ({ value: c, label: titleCase(c) }))
    ],
    []
  )

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
            style={{ paddingLeft: 38 }}
          />
        </div>
        <div style={{ width: 190 }}>
          <Select value={sort} options={SORT_OPTIONS} onChange={setSort} />
        </div>
        {kind === 'mod' && (
          <Button
            icon={SlidersHorizontal}
            variant={showFilters || category ? 'primary' : 'ghost'}
            onClick={() => setShowFilters((v) => !v)}
          >
            Filters
          </Button>
        )}
      </div>

      {showFilters && kind === 'mod' && (
        <motion.div
          className="row"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          style={{ gap: 10 }}
        >
          <div style={{ width: 230 }}>
            <Select value={category} options={categoryOptions} onChange={setCategory} />
          </div>
          {profile && (
            <span className="tiny">
              Showing {KIND_LABELS[kind].plural.toLowerCase()} compatible with Minecraft{' '}
              {profile.minecraftVersion}
              {kind === 'mod' && profile.loader !== 'vanilla'
                ? ` · ${LOADER_LABELS[profile.loader]}`
                : ''}
            </span>
          )}
        </motion.div>
      )}

      {loading ? (
        <div className="empty-state">
          <span className="spinner" style={{ width: 28, height: 28, color: 'var(--accent)' }} />
        </div>
      ) : hits.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Nothing found"
          hint="Try a different search term or loosen the filters."
        />
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          {hits.map((hit) => {
            const isInstalled = installed.has(hit.project_id) || installedProjectIds?.has(hit.project_id)
            return (
              <motion.div
                key={hit.project_id}
                className="card hoverable mod-row"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                style={{ cursor: 'pointer' }}
                onClick={() => openProject(hit.project_id)}
              >
                {hit.icon_url ? (
                  <img className="mod-icon" src={hit.icon_url} alt="" loading="lazy" />
                ) : (
                  <span className="mod-icon">
                    <Package size={22} />
                  </span>
                )}
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
                    {(hit.display_categories ?? hit.categories)?.slice(0, 3).map((cat) => (
                      <span key={cat} className="badge">
                        {titleCase(cat)}
                      </span>
                    ))}
                  </div>
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant={isInstalled ? 'ghost' : 'primary'}
                    icon={isInstalled ? Check : Download}
                    loading={installing.has(hit.project_id)}
                    disabled={isInstalled}
                    onClick={() => void install(hit)}
                  >
                    {isInstalled ? 'Installed' : 'Install'}
                  </Button>
                </div>
              </motion.div>
            )
          })}
          {hits.length < totalHits && (
            <Button onClick={() => void search(offset + PAGE_SIZE, true)} style={{ alignSelf: 'center' }}>
              Load more ({formatCount(totalHits - hits.length)} remaining)
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
