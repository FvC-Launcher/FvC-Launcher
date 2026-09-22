import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import {
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
  Timer,
  User,
  type LucideIcon
} from 'lucide-react'
import { Avatar, Button } from '@/components/ui'
import {
  formatCount,
  formatPlayTime,
  formatRelative,
  useActiveAccount,
  useApp,
  useSelectedProfile
} from '@/store'
import { LOADER_LABELS, PREPARING_PHASES, profileIcon } from '@/lib'
import type { ModrinthSearchHit, NewsItem } from '@shared/types'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'Up late'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export function HomePage(): ReactNode {
  const navigate = useApp((s) => s.navigate)
  const openProject = useApp((s) => s.openProject)
  const openProfile = useApp((s) => s.openProfile)
  const profiles = useApp((s) => s.profiles)
  const launches = useApp((s) => s.launches)
  const profile = useSelectedProfile()
  const account = useActiveAccount()

  const [news, setNews] = useState<NewsItem[]>([])
  const [featured, setFeatured] = useState<ModrinthSearchHit[]>([])

  useEffect(() => {
    void window.fvc.news.launcher().then(setNews)
    window.fvc.modrinth
      .featured()
      .then((r) => setFeatured(r.hits))
      .catch(() => setFeatured([]))
  }, [])

  const recentProfiles = [...profiles]
    .filter((p) => p.lastPlayed)
    .sort((a, b) => (b.lastPlayed ?? '').localeCompare(a.lastPlayed ?? ''))
    .slice(0, 4)

  const versions = [...new Set(profiles.map((p) => p.minecraftVersion))]
  const totalPlaySeconds = profiles.reduce((sum, p) => sum + (p.playTimeSeconds || 0), 0)
  const running = launches.filter((l) => l.phase === 'running').length

  const preparing = launches.find((l) => PREPARING_PHASES.includes(l.phase))
  const busy = !!preparing

  const HeroIcon = profile ? profileIcon(profile.icon) : Package
  const heroStyle: CSSProperties | undefined = profile?.backgroundImage
    ? { backgroundImage: `url("${profile.backgroundImage}")` }
    : undefined

  return (
    <div className="home stack">
      {/* Hero */}
      <section className={`home-hero ${profile?.backgroundImage ? 'has-cover' : ''}`}>
        <div className="home-hero-bg" style={heroStyle} />
        <div className="home-hero-top">
          <div className="home-eyebrow">
            {greeting()}
            {account ? `, ${account.username}` : ''}
          </div>
          {account ? (
            <button className="home-account" onClick={() => navigate('accounts')}>
              <Avatar username={account.type === 'microsoft' ? account.username : ''} size={32} radius={8} />
              <div>
                <div className="home-account-name">{account.username}</div>
                {/* The startup session check flags dead Microsoft sessions. */}
                {account.needsRelogin ? (
                  <div className="badge error" style={{ marginTop: 3 }}>
                    Session expired — sign in again
                  </div>
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

        <div className="home-hero-main">
          {profile ? (
            <>
              <span className="home-hero-icon">
                <HeroIcon size={30} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="home-hero-label">Ready to play</div>
                <h1 className="home-hero-title">{profile.name}</h1>
                <div className="home-chips">
                  <span className="home-chip">Minecraft {profile.minecraftVersion}</span>
                  <span className="home-chip">{LOADER_LABELS[profile.loader]}</span>
                  <span className="home-chip">
                    <Timer size={12} /> {formatPlayTime(profile.playTimeSeconds)}
                  </span>
                  {profile.lastPlayed && (
                    <span className="home-chip">
                      <Clock size={12} /> {formatRelative(profile.lastPlayed)}
                    </span>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div>
              <h1 className="home-hero-title">Let’s get you playing</h1>
              <p className="muted" style={{ marginTop: 6 }}>
                Create your first profile to pick a version and loader.
              </p>
            </div>
          )}
        </div>

        <div className="home-hero-actions">
          {profile ? (
            <button className="btn-play home-play" disabled={busy} onClick={() => navigate('play')}>
              {busy ? <span className="spinner" /> : <Play fill="currentColor" />}
              {preparing ? preparing.detail || 'Working…' : 'Play'}
            </button>
          ) : (
            <button className="btn-play home-play" onClick={() => navigate('profiles')}>
              <Plus /> Create profile
            </button>
          )}
          <Button variant="ghost" icon={Layers} onClick={() => navigate('profiles')}>
            Profiles
          </Button>
          <Button variant="ghost" icon={Package} onClick={() => navigate('mods')}>
            Browse mods
          </Button>
        </div>
      </section>

      {/* Stats */}
      <div className="home-stats">
        <Stat icon={Layers} label="Profiles" value={String(profiles.length)} />
        <Stat
          icon={Timer}
          label="Total play time"
          value={totalPlaySeconds < 60 ? '0 min' : formatPlayTime(totalPlaySeconds)}
        />
        <Stat
          icon={Package}
          label="Versions"
          value={String(versions.length)}
          hint={versions.slice(0, 3).join(' · ') || undefined}
        />
        <Stat
          icon={Gamepad2}
          label="Running now"
          value={String(running)}
          active={running > 0}
        />
      </div>

      <div className="home-columns">
        {/* Recent profiles */}
        <section className="stack" style={{ gap: 12 }}>
          <SectionHeader icon={Clock} title="Jump back in">
            <Button variant="subtle" onClick={() => navigate('profiles')}>
              All profiles <ArrowRight size={14} />
            </Button>
          </SectionHeader>
          {recentProfiles.length === 0 ? (
            <div className="card home-empty">
              <Gamepad2 size={28} />
              <div>
                <div style={{ fontWeight: 600 }}>Nothing played yet</div>
                <div className="tiny" style={{ marginTop: 2 }}>
                  Your recently played profiles will show up here.
                </div>
              </div>
            </div>
          ) : (
            <div className="home-recent">
              {recentProfiles.map((p) => {
                const Icon = profileIcon(p.icon)
                return (
                  <button
                    key={p.id}
                    className="card hoverable home-recent-card"
                    onClick={() => openProfile(p.id)}
                  >
                    {p.backgroundImage && (
                      <div
                        className="home-recent-cover"
                        style={{ backgroundImage: `url("${p.backgroundImage}")` }}
                      />
                    )}
                    <span className="mod-icon home-recent-icon">
                      <Icon size={20} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="home-recent-name">{p.name}</div>
                      <div className="tiny" style={{ marginTop: 2 }}>
                        {p.minecraftVersion} · {LOADER_LABELS[p.loader]} · {formatPlayTime(p.playTimeSeconds)}
                      </div>
                    </div>
                    <div className="home-recent-foot tiny">
                      <Clock size={11} /> {formatRelative(p.lastPlayed)}
                    </div>
                    <ChevronRight size={16} className="home-recent-chev" />
                  </button>
                )
              })}
            </div>
          )}

          <div className="card home-support">
            <span className="home-support-icon">
              <Coffee size={18} />
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Enjoying FvC Launcher?</div>
              <div className="tiny" style={{ marginTop: 2 }}>
                It’s free and open source. A coffee helps keep it that way.
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => window.fvc.system.openExternal('https://ko-fi.com/fvclauncher')}
            >
              Buy me a coffee
            </Button>
          </div>
        </section>

        {/* News */}
        <section className="stack" style={{ gap: 12 }}>
          <SectionHeader icon={Newspaper} title="What’s new" />
          <div className="card home-news">
            {news.length === 0 && <div className="tiny" style={{ padding: 18 }}>No news right now.</div>}
            {news.map((item) => (
              <article key={item.title} className="home-news-item">
                <div className="row between" style={{ gap: 10 }}>
                  <span className="badge accent">{item.tag}</span>
                  <span className="tiny">{new Date(item.date).toLocaleDateString()}</span>
                </div>
                <h3 style={{ marginTop: 8 }}>{item.title}</h3>
                <p className="muted home-news-body">{item.body}</p>
              </article>
            ))}
          </div>
        </section>
      </div>

      {/* Featured mods */}
      {featured.length > 0 && (
        <section className="stack" style={{ gap: 12 }}>
          <SectionHeader icon={Heart} title="Popular on Modrinth">
            <Button variant="subtle" onClick={() => navigate('mods')}>
              Browse all <ArrowRight size={14} />
            </Button>
          </SectionHeader>
          <div className="home-featured">
            {featured.map((hit) => (
              <button
                key={hit.project_id}
                className="card hoverable home-mod"
                onClick={() => openProject(hit.project_id)}
              >
                <div className="row" style={{ gap: 12 }}>
                  {hit.icon_url ? (
                    <img className="mod-icon" src={hit.icon_url} alt="" loading="lazy" style={{ width: 44, height: 44 }} />
                  ) : (
                    <span className="mod-icon" style={{ width: 44, height: 44 }}>
                      <Package size={18} />
                    </span>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div className="home-mod-title">{hit.title}</div>
                    <div className="tiny">by {hit.author}</div>
                  </div>
                </div>
                <p className="home-mod-desc">{hit.description}</p>
                <div className="home-mod-foot tiny">
                  <span>
                    <Download size={12} /> {formatCount(hit.downloads)}
                  </span>
                  <span>
                    <Heart size={12} /> {formatCount(hit.follows)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
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
    <div className={`card home-stat ${active ? 'active' : ''}`}>
      <span className="home-stat-icon">
        <Icon size={18} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="home-stat-value">{value}</div>
        <div className="tiny home-stat-label">{hint ? `${label} · ${hint}` : label}</div>
      </div>
    </div>
  )
}
