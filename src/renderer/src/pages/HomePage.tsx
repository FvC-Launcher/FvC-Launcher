import { useEffect, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  Clock,
  Coffee,
  Download,
  Gamepad2,
  Heart,
  Layers,
  Newspaper,
  Package,
  Play,
  Plus,
  Settings2,
  Timer,
  User,
  type LucideIcon
} from 'lucide-react'
import { Avatar, Button } from '@/components/ui'
import { ProfileCover } from '@/components/ProfileCover'
import {
  formatCount,
  formatPlayTime,
  formatRelative,
  useActiveAccount,
  useApp,
  useSelectedProfile
} from '@/store'
import { LOADER_LABELS, PREPARING_PHASES, profileIcon } from '@/lib'
import type { ModrinthSearchHit, NewsItem, Profile } from '@shared/types'

const DONATE_URL = 'https://ko-fi.com/fvclauncher'

const NEWS_SEEN_KEY = 'fvc.news.seenId'

function readSeenNewsId(): number {
  try {
    return Number(localStorage.getItem(NEWS_SEEN_KEY)) || 0
  } catch {
    return 0
  }
}

/** Announcement dates are plain days; parse them as local dates so they don't shift a day west of UTC. */
function formatNewsDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const local = y && m && d ? new Date(y, m - 1, d) : new Date(date)
  return local.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'Up late'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

const TODAY = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

export function HomePage(): ReactNode {
  const navigate = useApp((s) => s.navigate)
  const openProject = useApp((s) => s.openProject)
  const openProfile = useApp((s) => s.openProfile)
  const selectProfile = useApp((s) => s.selectProfile)
  const profiles = useApp((s) => s.profiles)
  const launches = useApp((s) => s.launches)
  const profile = useSelectedProfile()
  const account = useActiveAccount()

  const [news, setNews] = useState<NewsItem[] | null>(null)
  const [featured, setFeatured] = useState<ModrinthSearchHit[]>([])
  const [openNews, setOpenNews] = useState<number | null>(null)
  // Announcements newer than this were published since the last visit.
  const [seenNewsId] = useState(readSeenNewsId)

  useEffect(() => {
    void window.fvc.news
      .launcher()
      .then((items) => {
        setNews(items)
        const newest = Math.max(0, ...items.map((i) => i.id))
        try {
          if (newest > readSeenNewsId()) localStorage.setItem(NEWS_SEEN_KEY, String(newest))
        } catch {
          // Storage unavailable — everything just stays "new".
        }
      })
      .catch(() => setNews([]))
    window.fvc.modrinth
      .featured()
      .then((r) => setFeatured(r.hits))
      .catch(() => setFeatured([]))
  }, [])

  // Most recently played first; never-played ones follow, newest first.
  const recent = [...profiles]
    .sort(
      (a, b) =>
        (b.lastPlayed ?? '').localeCompare(a.lastPlayed ?? '') || b.createdAt.localeCompare(a.createdAt)
    )
    .slice(0, 5)

  const versions = [...new Set(profiles.map((p) => p.minecraftVersion))]
  const totalPlaySeconds = profiles.reduce((sum, p) => sum + (p.playTimeSeconds || 0), 0)
  const running = launches.filter((l) => l.phase === 'running')
  const preparing = launches.find((l) => PREPARING_PHASES.includes(l.phase))

  const playProfile = (p: Profile): void => {
    void selectProfile(p.id).then(() => navigate('play'))
  }

  return (
    <div className="home stack">
      {/* ------------------------------------------------------------ Header */}
      <header className="home-head">
        <div style={{ minWidth: 0 }}>
          <div className="home-date">{TODAY}</div>
          <h1 className="home-greeting">
            {greeting()}
            {account ? <span>, {account.username}</span> : null}
          </h1>
        </div>
        <div className="home-head-actions">
        <button className="home-donate" onClick={() => window.fvc.system.openExternal(DONATE_URL)}>
          <Heart size={15} fill="currentColor" /> Support FvC
        </button>
        {account ? (
          <button className="home-account" onClick={() => navigate('accounts')}>
            <Avatar username={account.type === 'microsoft' ? account.username : ''} size={32} radius={8} />
            <div>
              <div className="home-account-name">{account.username}</div>
              {/* The startup session check flags dead Microsoft sessions. */}
              {account.needsRelogin ? (
                <div className="home-account-status error">Session expired</div>
              ) : (
                <div className="home-account-status">
                  <span className="dot" />
                  {account.type === 'microsoft' ? 'Microsoft' : 'Offline'}
                </div>
              )}
            </div>
            <ChevronRight size={16} className="home-account-chev" />
          </button>
        ) : (
          <Button variant="primary" icon={User} onClick={() => navigate('accounts')}>
            Add account
          </Button>
        )}
        </div>
      </header>

      {/* ----------------------------------------------- Continue + recents */}
      <div className="home-top">
        {profile ? (
          <FeaturedProfile
            profile={profile}
            running={running.some((l) => l.profileId === profile.id)}
            preparingDetail={preparing?.profileId === profile.id ? preparing.detail || 'Starting…' : null}
            blocked={!!preparing && preparing.profileId !== profile.id}
            onPlay={() => playProfile(profile)}
            onManage={() => openProfile(profile.id)}
          />
        ) : (
          <section className="home-feature empty">
            <span className="home-feature-empty-icon">
              <Gamepad2 size={30} />
            </span>
            <h2>Let’s get you playing</h2>
            <p className="muted">Create a profile to pick a Minecraft version and loader, or install a modpack.</p>
            <button className="btn-play home-play" onClick={() => navigate('profiles')}>
              <Plus /> Create profile
            </button>
          </section>
        )}

        <section className="card home-recent">
          <div className="home-recent-head">
            <span className="home-card-title">
              <Clock size={15} /> Jump back in
            </span>
            <button className="home-link" onClick={() => navigate('profiles')}>
              All <ArrowRight size={13} />
            </button>
          </div>
          {recent.length === 0 ? (
            <div className="home-recent-empty tiny">Your profiles will show up here.</div>
          ) : (
            <div className="home-recent-list">
              {recent.map((p) => {
                const isSelected = p.id === profile?.id
                const isRunning = running.some((l) => l.profileId === p.id)
                return (
                  <div
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    className={`home-recent-row ${isSelected ? 'selected' : ''}`}
                    onClick={() => void selectProfile(p.id)}
                    onKeyDown={(e) => e.key === 'Enter' && void selectProfile(p.id)}
                    title={isSelected ? 'Selected profile' : `Select ${p.name}`}
                  >
                    <span className="home-recent-thumb">
                      <ProfileCover profile={p} />
                    </span>
                    <span className="home-recent-text">
                      <span className="home-recent-name">
                        {p.name}
                        {isRunning && <span className="home-live-dot" title="Running" />}
                      </span>
                      <span className="tiny">
                        {p.minecraftVersion} · {LOADER_LABELS[p.loader]} ·{' '}
                        {p.lastPlayed ? formatRelative(p.lastPlayed) : 'Not played yet'}
                      </span>
                    </span>
                    <button
                      className="home-recent-play"
                      title={`Play ${p.name}`}
                      aria-label={`Play ${p.name}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        playProfile(p)
                      }}
                    >
                      <Play size={13} fill="currentColor" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          <button className="home-recent-new" onClick={() => navigate('profiles')}>
            <Plus size={15} /> New profile
          </button>
        </section>
      </div>

      {/* ------------------------------------------------------------- Stats */}
      <div className="card home-stats">
        <Stat icon={Layers} label="Profiles" value={String(profiles.length)} />
        <Stat
          icon={Timer}
          label="Total play time"
          value={totalPlaySeconds < 60 ? '0 min' : formatPlayTime(totalPlaySeconds)}
        />
        <Stat
          icon={Package}
          label={versions.length === 1 ? 'Minecraft version' : 'Minecraft versions'}
          value={String(versions.length)}
          hint={versions.slice(0, 3).join(' · ') || undefined}
        />
        <Stat icon={Gamepad2} label="Running now" value={String(running.length)} active={running.length > 0} />
      </div>

      {/* ------------------------------------------------------ Mods + news */}
      <div className="home-columns">
        <section className="stack" style={{ gap: 12 }}>
          <SectionHeader icon={Heart} title="Popular on Modrinth">
            <button className="home-link" onClick={() => navigate('mods')}>
              Browse mods <ArrowRight size={13} />
            </button>
          </SectionHeader>
          {featured.length === 0 ? (
            <div className="card home-placeholder tiny">Couldn’t load popular mods right now.</div>
          ) : (
            <div className="home-featured">
              {featured.slice(0, 6).map((hit, i) => (
                <button key={hit.project_id} className="home-mod" onClick={() => openProject(hit.project_id)}>
                  <span className="home-mod-rank">{i + 1}</span>
                  {hit.icon_url ? (
                    <img className="home-mod-icon" src={hit.icon_url} alt="" loading="lazy" />
                  ) : (
                    <span className="home-mod-icon">
                      <Package size={18} />
                    </span>
                  )}
                  <span className="home-mod-text">
                    <span className="home-mod-title">{hit.title}</span>
                    <span className="home-mod-desc">{hit.description}</span>
                    <span className="home-mod-foot">
                      <span>
                        <Download size={11} /> {formatCount(hit.downloads)}
                      </span>
                      <span>
                        <Heart size={11} /> {formatCount(hit.follows)}
                      </span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="stack" style={{ gap: 12 }}>
          <SectionHeader icon={Newspaper} title="What’s new">
            {news && news.some((i) => i.id > seenNewsId) && (
              <span className="home-news-count">{news.filter((i) => i.id > seenNewsId).length} new</span>
            )}
          </SectionHeader>
          <div className="card home-news">
            {news === null && (
              <div className="row tiny" style={{ padding: 18, gap: 10 }}>
                <span className="spinner" /> Loading announcements…
              </div>
            )}
            {news?.length === 0 && <div className="tiny" style={{ padding: 18 }}>No announcements right now.</div>}
            {news?.map((item) => {
              const expanded = openNews === item.id
              const isNew = item.id > seenNewsId
              return (
                <article
                  key={item.id}
                  className={`home-news-item ${expanded ? 'open' : ''} ${item.important ? 'important' : ''}`}
                >
                  <span className="home-news-dot" />
                  <div className="home-news-meta">
                    <span className="row" style={{ gap: 6 }}>
                      {item.important ? (
                        <span className="badge error">
                          <AlertTriangle size={11} /> Important
                        </span>
                      ) : (
                        <span className="badge accent">News</span>
                      )}
                      {isNew && <span className="home-news-new">New</span>}
                    </span>
                    <span className="tiny">{formatNewsDate(item.date)}</span>
                  </div>
                  <h3>{item.title}</h3>
                  {item.body && <p className="home-news-body">{item.body}</p>}
                  {item.body.length > 140 && (
                    <button className="home-link" onClick={() => setOpenNews(expanded ? null : item.id)}>
                      {expanded ? 'Show less' : 'Read more'}
                    </button>
                  )}
                </article>
              )
            })}
          </div>

          <div className="home-support">
            <span className="home-support-icon">
              <Coffee size={22} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="home-support-title">Enjoying FvC Launcher?</div>
              <div className="home-support-text">
                It’s free, open source and ad-free. A coffee keeps it that way.
              </div>
            </div>
            <button className="home-donate solid" onClick={() => window.fvc.system.openExternal(DONATE_URL)}>
              <Coffee size={16} /> Buy me a coffee
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

function FeaturedProfile({
  profile,
  running,
  preparingDetail,
  blocked,
  onPlay,
  onManage
}: {
  profile: Profile
  running: boolean
  preparingDetail: string | null
  blocked: boolean
  onPlay: () => void
  onManage: () => void
}): ReactNode {
  const Icon = profileIcon(profile.icon)
  return (
    <section className="home-feature">
      <ProfileCover profile={profile} />
      <div className="home-feature-body">
        <span className="pf-hero-icon home-feature-icon">
          <Icon size={28} />
        </span>
        <div className={`pf-hero-label ${running ? 'running' : ''}`}>
          {running ? (
            <>
              <span className="dot" /> Running now
            </>
          ) : profile.lastPlayed ? (
            'Continue playing'
          ) : (
            'Ready for its first run'
          )}
        </div>
        <h2 className="home-feature-title" title={profile.name}>
          {profile.name}
        </h2>
        <div className="home-chips">
          <span className="home-chip">Minecraft {profile.minecraftVersion}</span>
          <span className="home-chip">{LOADER_LABELS[profile.loader]}</span>
          {profile.playTimeSeconds >= 60 && (
            <span className="home-chip">
              <Timer size={12} /> {formatPlayTime(profile.playTimeSeconds)}
            </span>
          )}
          {profile.lastPlayed && (
            <span className="home-chip">
              <Clock size={12} /> {formatRelative(profile.lastPlayed)}
            </span>
          )}
        </div>
        <div className="home-feature-actions">
          <button
            className="btn-play home-play"
            disabled={!!preparingDetail || blocked}
            title={blocked ? 'Another game is still starting' : undefined}
            onClick={onPlay}
          >
            {preparingDetail ? <span className="spinner" /> : <Play fill="currentColor" />}
            <span className="home-play-label">{preparingDetail ?? 'Play'}</span>
          </button>
          <button className="pf-back home-manage" onClick={onManage}>
            <Settings2 size={15} /> Manage
          </button>
        </div>
      </div>
    </section>
  )
}

function SectionHeader({
  icon: Icon,
  title,
  children
}: {
  icon: LucideIcon
  title: string
  children?: ReactNode
}): ReactNode {
  return (
    <div className="row between">
      <div className="row" style={{ gap: 10 }}>
        <span className="home-section-icon">
          <Icon size={16} />
        </span>
        <h2>{title}</h2>
      </div>
      {children}
    </div>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  active
}: {
  icon: LucideIcon
  label: string
  value: string
  hint?: string
  active?: boolean
}): ReactNode {
  return (
    <div className={`home-stat ${active ? 'active' : ''}`}>
      <span className="home-stat-icon">
        <Icon size={17} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="home-stat-value">{value}</div>
        <div className="tiny home-stat-label" title={hint}>
          {hint ? `${label} · ${hint}` : label}
        </div>
      </div>
    </div>
  )
}
