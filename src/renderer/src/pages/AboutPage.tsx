import { useEffect, useState, type ReactNode } from 'react'
import { ExternalLink, FileText, Github, Heart, Play, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui'
import { LegalViewer, type LegalDoc } from '@/components/LegalViewer'
import { useApp } from '@/store'

export function AboutPage(): ReactNode {
  const [version, setVersion] = useState('…')
  const [viewing, setViewing] = useState<LegalDoc | null>(null)
  const platform = window.fvc.system.platform
  const developerMode = useApp((s) => s.settings.developerMode)

  useEffect(() => {
    void window.fvc.system.appVersion().then(setVersion)
  }, [])

  return (
    <div className="stack" style={{ gap: 20, maxWidth: 720, margin: '0 auto' }}>
      <div className="play-hero" style={{ gap: 14 }}>
        <span
          className="logo"
          style={{
            width: 72,
            height: 72,
            borderRadius: 20,
            background: 'linear-gradient(135deg, var(--accent), #7b5bff)',
            display: 'grid',
            placeItems: 'center',
            boxShadow: 'var(--glow)'
          }}
        >
          <Play size={32} fill="#081018" strokeWidth={0} />
        </span>
        <h1>FvC Launcher</h1>
        <span className="badge accent">Version {version}</span>
        <p className="muted" style={{ textAlign: 'center', maxWidth: 460, lineHeight: 1.6 }}>
          A modern Minecraft launcher with isolated profiles, Modrinth integration, automatic
          dependency handling and support for Fabric, Forge, NeoForge and Quilt.
        </p>
      </div>

      <div className="card">
        {[
          ['Platform', platform === 'win32' ? 'Windows' : platform === 'linux' ? 'Linux' : platform],
          ['Runtime', `Electron · Chromium · Node.js`],
          ['Mod source', 'Modrinth API v2'],
          ['Authentication', 'Microsoft OAuth (msmc) · Offline sessions']
        ].map(([k, v]) => (
          <div key={k} className="setting-row">
            <div className="s-label">{k}</div>
            <span className="muted" style={{ fontSize: '0.86rem' }}>{v}</span>
          </div>
        ))}
      </div>

      <div className="row" style={{ justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Button icon={ShieldCheck} onClick={() => setViewing('privacy')}>
          View Privacy Policy
        </Button>
        <Button icon={FileText} onClick={() => setViewing('eula')}>
          View EULA
        </Button>
        <Button icon={ExternalLink} onClick={() => window.fvc.system.openExternal('https://modrinth.com')}>
          Modrinth
        </Button>
        <Button
          icon={Github}
          onClick={() => window.fvc.system.openExternal('https://github.com/FvC-Launcher/FvC-Launcher')}
        >
          Source
        </Button>
      </div>

      <LegalViewer doc={viewing} onClose={() => setViewing(null)} />

      <p className="tiny" style={{ textAlign: 'center', lineHeight: 1.6 }}>
        Not affiliated with Mojang, Microsoft or Modrinth. Minecraft is a trademark of Mojang AB.
        <br />
        Made with <Heart size={11} style={{ verticalAlign: -1, color: 'var(--error)' }} /> — FvC
        {developerMode && ' · developer mode active'}
      </p>
    </div>
  )
}
