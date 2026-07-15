import { useEffect, useState, type ReactNode } from 'react'
import { ArrowUpCircle, ExternalLink, FileText, Github, Heart, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui'
import { LegalViewer, type LegalDoc } from '@/components/LegalViewer'
import { useApp } from '@/store'
import logo from '@/assets/icon.png'
import type { UpdaterState } from '@shared/types'

export function AboutPage(): ReactNode {
  const [version, setVersion] = useState('…')
  const [viewing, setViewing] = useState<LegalDoc | null>(null)
  const [updater, setUpdater] = useState<UpdaterState>({ status: 'idle' })
  const platform = window.fvc.system.platform
  const developerMode = useApp((s) => s.settings.developerMode)

  useEffect(() => {
    void window.fvc.system.appVersion().then(setVersion)
    void window.fvc.updater.getState().then(setUpdater)
    return window.fvc.updater.onState(setUpdater)
  }, [])

  const updateLabel = {
    idle: 'Check for updates',
    checking: 'Checking…',
    available: `v${updater.version} available`,
    downloading: `Downloading… ${Math.round(updater.percent ?? 0)}%`,
    downloaded: 'Restart to install',
    error: 'Check for updates',
    dev: 'Check for updates'
  }[updater.status]

  return (
    <div className="stack" style={{ gap: 20, maxWidth: 720, margin: '0 auto' }}>
      <div className="play-hero" style={{ gap: 14 }}>
        <img
          src={logo}
          alt=""
          style={{ width: 84, height: 84, borderRadius: 20, objectFit: 'contain' }}
        />
        <h1>FvC Launcher</h1>
        <div className="row" style={{ gap: 8 }}>
          <span className="badge accent">Version {version}</span>
          <Button
            variant="outline"
            icon={ArrowUpCircle}
            loading={updater.status === 'checking'}
            onClick={() => {
              if (updater.status === 'downloaded') window.fvc.updater.install()
              else void window.fvc.updater.check()
            }}
          >
            {updateLabel}
          </Button>
        </div>
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
          ['Authentication', 'Microsoft OAuth (msmc) · Offline sessions'],
          ['Updates', 'GitHub Releases (with your consent — never silent)']
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
