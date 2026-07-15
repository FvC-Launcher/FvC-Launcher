import { useEffect, useState, type ReactNode } from 'react'
import {
  ArrowRight,
  Clock,
  Coffee,
  Download,
  Heart,
  Newspaper,
  Package,
  Play,
  User
} from 'lucide-react'
import { Avatar, Button } from '@/components/ui'
import { formatCount, formatRelative, useActiveAccount, useApp, useSelectedProfile } from '@/store'
import { LOADER_LABELS, profileIcon } from '@/lib'
import type { ModrinthSearchHit, NewsItem } from '@shared/types'

export function HomePage(): ReactNode {
  const navigate = useApp((s) => s.navigate)
  const openProject = useApp((s) => s.openProject)
  const openProfile = useApp((s) => s.openProfile)
  const profiles = useApp((s) => s.profiles)
  const launch = useApp((s) => s.launch)
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
    .slice(0, 3)

  const busy = launch.phase !== 'idle' && launch.phase !== 'stopped' && launch.phase !== 'error'

  return (
    <div className="stack" style={{ gap: 24 }}>
      {/* Hero */}
      <div className="play-hero" style={{ padding: '40px 32px', alignItems: 'flex-start', gap: 14 }}>
        <div className="row between" style={{ width: '100%' }}>
          <div>
            <h1 style={{ fontSize: '1.9rem' }}>
              Welcome back{account ? `, ${account.username}` : ''}
            </h1>
            <p className="muted" style={{ marginTop: 6 }}>
              {profile
                ? `Ready to play ${profile.name} — Minecraft ${profile.minecraftVersion} (${LOADER_LABELS[profile.loader]})`
                : 'Create your first profile to get started.'}
            </p>
          </div>
          {account ? (
            <div className="row card" style={{ padding: '10px 16px', gap: 12 }}>
              <Avatar username={account.type === 'microsoft' ? account.username : ''} size={36} radius={8} />
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{account.username}</div>
                <div className="tiny">{account.type === 'microsoft' ? 'Microsoft' : 'Offline'}</div>
              </div>
            </div>
          ) : (
            <Button variant="primary" icon={User} onClick={() => navigate('accounts')}>
              Add account
            </Button>
          )}
        </div>
        <div className="row" style={{ gap: 12 }}>
          <Button
            variant="primary"
            icon={Play}
            disabled={!profile || busy}
            onClick={() => navigate('play')}
            style={{ padding: '12px 28px', fontSize: '1rem' }}
          >
            {busy ? launch.detail || 'Working…' : 'Quick Launch'}
          </Button>
          <Button icon={Package} onClick={() => navigate('mods')}>
            Browse mods
          </Button>
          <Button
            variant="outline"
            icon={Coffee}
            onClick={() => window.fvc.system.openExternal('https://ko-fi.com/fvclauncher')}
          >
            Buy me a coffee
          </Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20 }}>
        {/* News */}
        <section className="stack" style={{ gap: 12 }}>
          <div className="row" style={{ gap: 8 }}>
            <Newspaper size={18} style={{ color: 'var(--accent)' }} />
            <h2>Launcher news</h2>
          </div>
          {news.map((item) => (
            <article key={item.title} className="card" style={{ padding: 18 }}>
              <div className="row between">
                <h3>{item.title}</h3>
                <span className="badge accent">{item.tag}</span>
              </div>
              <p className="muted" style={{ fontSize: '0.86rem', lineHeight: 1.55, marginTop: 6 }}>
                {item.body}
              </p>
              <div className="tiny" style={{ marginTop: 10 }}>
                {new Date(item.date).toLocaleDateString()}
              </div>
            </article>
          ))}
        </section>

        {/* Recent profiles */}
        <section className="stack" style={{ gap: 12 }}>
          <div className="row between">
            <div className="row" style={{ gap: 8 }}>
              <Clock size={18} style={{ color: 'var(--accent)' }} />
              <h2>Recently played</h2>
            </div>
            <Button variant="subtle" onClick={() => navigate('profiles')}>
              All profiles <ArrowRight size={14} />
            </Button>
          </div>
          {recentProfiles.length === 0 && (
            <div className="card" style={{ padding: 18 }}>
              <p className="muted" style={{ fontSize: '0.86rem' }}>
                Nothing played yet. Pick a profile and hit Play!
              </p>
            </div>
          )}
          {recentProfiles.map((p) => {
            const Icon = profileIcon(p.icon)
            return (
              <button
                key={p.id}
                className="card hoverable row"
                style={{ padding: 14, gap: 14, textAlign: 'left', width: '100%' }}
                onClick={() => openProfile(p.id)}
              >
                <span className="mod-icon" style={{ width: 42, height: 42 }}>
                  <Icon size={20} />
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>{p.name}</div>
                  <div className="tiny" style={{ marginTop: 2 }}>
                    {p.minecraftVersion} · {LOADER_LABELS[p.loader]} · {formatRelative(p.lastPlayed)}
                  </div>
                </div>
                <ArrowRight size={16} style={{ color: 'var(--text-3)' }} />
              </button>
            )
          })}

          {/* Installed versions summary */}
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ marginBottom: 8 }}>Installed versions</h3>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              {[...new Set(profiles.map((p) => p.minecraftVersion))].slice(0, 8).map((v) => (
                <span key={v} className="badge">
                  {v}
                </span>
              ))}
              {profiles.length === 0 && <span className="tiny">No profiles yet</span>}
            </div>
          </div>
        </section>
      </div>

      {/* Featured mods */}
      {featured.length > 0 && (
        <section className="stack" style={{ gap: 12 }}>
          <div className="row between">
            <div className="row" style={{ gap: 8 }}>
              <Heart size={18} style={{ color: 'var(--accent)' }} />
              <h2>Popular on Modrinth</h2>
            </div>
            <Button variant="subtle" onClick={() => navigate('mods')}>
              Browse all <ArrowRight size={14} />
            </Button>
          </div>
          <div className="grid-cards">
            {featured.map((hit) => (
              <button
                key={hit.project_id}
                className="card hoverable mod-row"
                style={{ textAlign: 'left' }}
                onClick={() => openProject(hit.project_id)}
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
                  </div>
                  <div className="tiny" style={{ marginTop: 3 }}>
                    <Download size={11} style={{ verticalAlign: -1 }} /> {formatCount(hit.downloads)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
