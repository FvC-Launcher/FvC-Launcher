import { useEffect, useRef, type ReactNode } from 'react'
import { hexToRgb, useApp } from '@/store'
import { themeById } from '@/themes'
import { TitleBar } from '@/components/TitleBar'
import { Sidebar } from '@/components/Sidebar'
import { NotificationHost } from '@/components/NotificationHost'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ModDetailsModal } from '@/components/ModDetailsModal'
import { FirstRunGate } from '@/components/FirstRunGate'
import { HwidScreen } from '@/components/HwidScreen'
import { UpdateModal } from '@/components/UpdateModal'
import { HomePage } from '@/pages/HomePage'
import { PlayPage } from '@/pages/PlayPage'
import { ProfilesPage } from '@/pages/ProfilesPage'
import { ModsPage } from '@/pages/ModsPage'
import { DownloadsPage } from '@/pages/DownloadsPage'
import { AccountsPage } from '@/pages/AccountsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { AboutPage } from '@/pages/AboutPage'

const PAGES = {
  home: HomePage,
  play: PlayPage,
  profiles: ProfilesPage,
  mods: ModsPage,
  downloads: DownloadsPage,
  accounts: AccountsPage,
  settings: SettingsPage,
  about: AboutPage
} as const

export default function App(): ReactNode {
  const page = useApp((s) => s.page)
  const boot = useApp((s) => s.boot)
  const settings = useApp((s) => s.settings)
  const init = useApp((s) => s.init)
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    void init()
  }, [init])

  // Apply user-tunable appearance settings as CSS variables.
  useEffect(() => {
    const root = document.documentElement
    // Theme preset first, then the user's own tweaks on top.
    for (const [key, value] of Object.entries(themeById(settings.theme).vars)) {
      root.style.setProperty(key, value)
    }
    root.style.setProperty('--accent', settings.accentColor)
    root.style.setProperty('--accent-2', settings.accentColor2)
    root.style.setProperty('--accent-rgb', hexToRgb(settings.accentColor))
    root.style.setProperty('--radius', `${settings.cornerRadius}px`)
    root.style.setProperty('--blur', String(settings.blurIntensity))
    root.style.setProperty('--speed', String(Math.max(0.25, settings.animationSpeed)))
    root.style.fontSize = `${(settings.compactMode ? 13.5 : 15) * Math.min(1.2, Math.max(0.85, settings.uiScale))}px`
    root.classList.toggle('compact', settings.compactMode)
    root.classList.toggle('sidebar-mini', settings.sidebarIconsOnly)
    root.classList.toggle('theme-light', settings.theme === 'light')
  }, [settings])

  const PageComponent = PAGES[page]

  // Startup gates: HWID validation failure replaces the whole app; the
  // first-run legal dialog blocks it until accepted.
  if (boot === 'hwid') return <HwidScreen />
  if (boot === 'loading') {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center' }}>
        <span className="spinner" style={{ width: 30, height: 30, color: 'var(--accent)' }} />
      </div>
    )
  }

  return (
    <div className="app">
      {settings.backgroundImage && (
        <div
          className="app-bg"
          style={{
            backgroundImage: `url("${settings.backgroundImage}")`,
            opacity: settings.backgroundOpacity
          }}
        />
      )}
      <TitleBar />
      <Sidebar />
      <main className="main">
        {/* CSS-driven transition: unlike AnimatePresence mode="wait", it can
            never strand the page at opacity 0 if an animation is interrupted
            (e.g. window minimized while a game launches). */}
        <ErrorBoundary key={page}>
          <div className="page page-anim">
            <PageComponent />
          </div>
        </ErrorBoundary>
      </main>
      <NotificationHost />
      <ModDetailsModal />
      <UpdateModal />
      {boot === 'legal' && <FirstRunGate />}
    </div>
  )
}
