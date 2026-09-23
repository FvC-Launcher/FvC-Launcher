import { useEffect, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowUpCircle,
  Bug,
  Check,
  CheckCircle2,
  ChevronRight,
  Coffee,
  Compass,
  Copy,
  Download,
  FileText,
  Github,
  Heart,
  Layers,
  Package,
  RefreshCw,
  Shirt,
  ShieldCheck,
  Sparkles,
  Tag,
  Users,
  type LucideIcon
} from 'lucide-react'
import { Button } from '@/components/ui'
import { LegalViewer, type LegalDoc } from '@/components/LegalViewer'
import { useApp } from '@/store'
import logo from '@/assets/icon.png'
import type { UpdaterState } from '@shared/types'

const REPO = 'https://github.com/FvC-Launcher/FvC-Launcher'

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Layers, title: 'Isolated profiles', text: 'Every profile has its own mods, saves, configs and settings.' },
  { icon: Package, title: 'Modrinth & CurseForge', text: 'Browse and install mods, packs and shaders with their dependencies.' },
  { icon: Sparkles, title: 'Every loader', text: 'Vanilla, Fabric, Forge, NeoForge and Quilt, set up automatically.' },
  { icon: Compass, title: 'Self-updating packs', text: 'Share modpacks on GitHub; players get new releases on Play.' },
  { icon: Shirt, title: 'FvC Skins', text: 'Custom skins for offline accounts, visible to other FvC players.' },
  { icon: Users, title: 'Your accounts', text: 'Microsoft sign-in or offline names, switch any time.' }
]

const LINKS: { icon: LucideIcon; label: string; hint: string; url: string }[] = [
  { icon: Github, label: 'Source code', hint: 'github.com/FvC-Launcher', url: REPO },
  { icon: Bug, label: 'Report a bug', hint: 'Open an issue on GitHub', url: `${REPO}/issues/new` },
  { icon: Tag, label: 'Releases', hint: 'Changelog and downloads', url: `${REPO}/releases` },
  { icon: Coffee, label: 'Support FvC', hint: 'Buy the developer a coffee', url: 'https://ko-fi.com/fvclauncher' },
  { icon: Package, label: 'Modrinth', hint: 'Where mods come from', url: 'https://modrinth.com' }
]

function platformName(platform: string): string {
  if (platform === 'win32') return 'Windows'
  if (platform === 'darwin') return 'macOS'
  if (platform === 'linux') return 'Linux'
  return platform
}

/** Electron's user agent carries the exact runtime versions. */
function runtimeVersion(name: 'Electron' | 'Chrome'): string {
  return new RegExp(`${name}/([\\d.]+)`).exec(navigator.userAgent)?.[1] ?? 'unknown'
}

export function AboutPage(): ReactNode {
  const [version, setVersion] = useState('')
  const [viewing, setViewing] = useState<LegalDoc | null>(null)
  const [updater, setUpdater] = useState<UpdaterState>({ status: 'idle' })
  const [copied, setCopied] = useState(false)
  const platform = window.fvc.system.platform
  const settings = useApp((s) => s.settings)
  const pushNotification = useApp((s) => s.pushNotification)

  useEffect(() => {
    void window.fvc.system.appVersion().then(setVersion)
    void window.fvc.updater.getState().then(setUpdater)
    return window.fvc.updater.onState(setUpdater)
  }, [])

  const prerelease = version.includes('-')
  const channel = prerelease || settings.alphaBuilds ? 'Alpha' : 'Stable'

  const systemInfo: [string, string][] = [
    ['Launcher', version ? `v${version}` : '…'],
    ['Update channel', channel],
    ['Platform', platformName(platform)],
    ['Electron', runtimeVersion('Electron')],
    ['Chromium', runtimeVersion('Chrome')],
    ['Developer mode', settings.developerMode ? 'On' : 'Off']
  ]

  const copyInfo = (): void => {
    const text = systemInfo.map(([k, v]) => `${k}: ${v}`).join('\n')
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      })
      .catch(() => pushNotification({ type: 'error', title: 'Could not copy' }))
  }

  const updateAction = (): void => {
    if (updater.status === 'downloaded') window.fvc.updater.install()
    else if (updater.status === 'manual') window.fvc.system.openExternal(`${REPO}/releases/latest`)
    else if (updater.status === 'available') void window.fvc.updater.download()
    else void window.fvc.updater.check()
  }

  return (
    <div className="about stack">
      {/* ------------------------------------------------------------ Hero */}
      <section className="about-hero">
        <div className="about-logo">
          <img src={logo} alt="" />
        </div>
        <h1>FvC Launcher</h1>
        <p className="about-tagline">
          A modern Minecraft launcher: isolated profiles, one-click modpacks and every mod loader, in one fast app.
        </p>
        <div className="about-badges">
          <span className="about-badge">{version ? `v${version}` : '…'}</span>
          <span className={`about-badge ${channel === 'Alpha' ? 'alpha' : 'stable'}`}>{channel} channel</span>
          <span className="about-badge">{platformName(platform)}</span>
        </div>

        <UpdateStatus updater={updater} onAction={updateAction} />
      </section>

      {/* -------------------------------------------------------- Features */}
      <section className="about-features">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <div key={title} className="about-feature">
            <span className="about-feature-icon">
              <Icon size={18} />
            </span>
            <div>
              <div className="about-feature-title">{title}</div>
              <div className="about-feature-text">{text}</div>
            </div>
          </div>
        ))}
      </section>

      {/* ------------------------------------------------ System + links */}
      <div className="about-columns">
        <section className="card about-card">
          <div className="about-card-head">
            <span className="about-card-title">System information</span>
            <Button variant="subtle" icon={copied ? Check : Copy} onClick={copyInfo}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <dl className="about-info">
            {systemInfo.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="tiny about-card-foot">Paste this into bug reports so problems are easier to track down.</p>
        </section>

        <section className="card about-card">
          <div className="about-card-head">
            <span className="about-card-title">Links</span>
          </div>
          <div className="about-links">
            {LINKS.map(({ icon: Icon, label, hint, url }) => (
              <button key={label} className="about-link" onClick={() => window.fvc.system.openExternal(url)}>
                <span className={`about-link-icon ${label === 'Support FvC' ? 'donate' : ''}`}>
                  <Icon size={16} />
                </span>
                <span className="about-link-text">
                  <span>{label}</span>
                  <span className="tiny">{hint}</span>
                </span>
                <ChevronRight size={15} className="about-link-chev" />
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* ------------------------------------------------------------ Legal */}
      <footer className="about-legal">
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Button variant="subtle" icon={ShieldCheck} onClick={() => setViewing('privacy')}>
            Privacy Policy
          </Button>
          <Button variant="subtle" icon={FileText} onClick={() => setViewing('eula')}>
            EULA
          </Button>
        </div>
        <p className="tiny">
          Not affiliated with Mojang, Microsoft or Modrinth. Minecraft is a trademark of Mojang AB.
        </p>
        <p className="tiny">
          Made with <Heart size={11} className="about-heart" /> by FvC · open source under the MIT license
        </p>
      </footer>

      <LegalViewer doc={viewing} onClose={() => setViewing(null)} />
    </div>
  )
}

function UpdateStatus({ updater, onAction }: { updater: UpdaterState; onAction: () => void }): ReactNode {
  const { status } = updater
  const view: { icon: LucideIcon; title: string; detail: string; tone: string; action?: string } = (() => {
    switch (status) {
      case 'checking':
        return { icon: RefreshCw, title: 'Checking for updates…', detail: 'Asking GitHub for the newest release.', tone: 'busy' }
      case 'available':
        return {
          icon: ArrowUpCircle,
          title: `Version ${updater.version} is available`,
          detail: updater.toStable ? 'Latest stable release.' : 'Download it now and install on restart.',
          tone: 'accent',
          action: 'Download'
        }
      case 'downloading':
        return {
          icon: Download,
          title: `Downloading ${updater.version ?? 'update'}…`,
          detail: `${Math.round(updater.percent ?? 0)}%${updater.speedBps ? ` · ${(updater.speedBps / 1024 / 1024).toFixed(1)} MB/s` : ''}`,
          tone: 'busy'
        }
      case 'downloaded':
        return {
          icon: CheckCircle2,
          title: `Version ${updater.version} is ready`,
          detail: 'Restart the launcher to finish updating.',
          tone: 'success',
          action: 'Restart & install'
        }
      case 'manual':
        return {
          icon: ArrowUpCircle,
          title: `Version ${updater.version} is available`,
          detail: 'Download it from GitHub to update.',
          tone: 'accent',
          action: 'Open download page'
        }
      case 'error':
        return {
          icon: AlertTriangle,
          title: 'Couldn’t check for updates',
          detail: updater.error ?? 'Try again in a moment.',
          tone: 'error',
          action: 'Try again'
        }
      case 'dev':
        return { icon: Sparkles, title: 'Development build', detail: 'Updates are disabled while running from source.', tone: 'muted' }
      default:
        return {
          icon: CheckCircle2,
          title: 'FvC Launcher',
          detail: 'Check whether a newer version is out.',
          tone: 'muted',
          action: 'Check for updates'
        }
    }
  })()
  const Icon = view.icon

  return (
    <div className={`about-update ${view.tone}`}>
      <span className={`about-update-icon ${status === 'checking' ? 'spin' : ''}`}>
        <Icon size={18} />
      </span>
      <div className="about-update-text">
        <div className="about-update-title">{view.title}</div>
        <div className="tiny about-ellipsis" title={view.detail}>
          {view.detail}
        </div>
        {status === 'downloading' && (
          <div className="progress" style={{ marginTop: 8 }}>
            <div style={{ width: `${updater.percent ?? 0}%` }} />
          </div>
        )}
      </div>
      {view.action && (
        <Button variant={view.tone === 'accent' || view.tone === 'success' ? 'primary' : 'ghost'} onClick={onAction}>
          {view.action}
        </Button>
      )}
    </div>
  )
}
