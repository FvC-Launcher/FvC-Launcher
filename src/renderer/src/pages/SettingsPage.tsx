import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode
} from 'react'
import {
  Check,
  Coffee,
  Download,
  FolderSearch,
  Gamepad2,
  History,
  Image,
  Palette,
  RefreshCw,
  ScrollText,
  Search,
  Settings2,
  Trash2,
  Undo2,
  Wrench,
  X,
  type LucideIcon
} from 'lucide-react'
import { Button, ConfirmDialog, Select, SettingRow, Slider, Toggle } from '@/components/ui'
import { useApp } from '@/store'
import { THEMES } from '@/themes'
import type { JavaInstall } from '@shared/types'

const ACCENT_PRESETS = ['#3BCBFF', '#7B5BFF', '#34D399', '#FBBF24', '#F87171', '#FF7AC6']

const SECTIONS: { id: string; label: string; icon: LucideIcon; description: string }[] = [
  { id: 'general', label: 'General', icon: Settings2, description: 'Startup, accounts and what happens when you play.' },
  { id: 'updates', label: 'Updates', icon: RefreshCw, description: 'How FvC Launcher keeps itself up to date.' },
  { id: 'game', label: 'Game', icon: Gamepad2, description: 'Defaults for every profile that doesn’t set its own.' },
  { id: 'java', label: 'Java', icon: Coffee, description: 'The Java runtime Minecraft runs on.' },
  { id: 'appearance', label: 'Appearance', icon: Palette, description: 'Theme, colors and how the launcher looks and feels.' },
  { id: 'downloads', label: 'Downloads', icon: Download, description: 'Download speed, mod updates and CurseForge.' },
  { id: 'advanced', label: 'Advanced', icon: Wrench, description: 'Troubleshooting, logs and resets.' }
]

// ------------------------------------------------------------------ search

const SearchContext = createContext('')

function matches(query: string, ...texts: (string | undefined)[]): boolean {
  if (!query) return true
  const needle = query.toLowerCase()
  return texts.some((t) => t?.toLowerCase().includes(needle))
}

/** A setting row that hides itself when it doesn't match the search. */
function Row({
  label,
  description,
  keywords,
  children
}: {
  label: string
  description?: string
  keywords?: string
  children: ReactNode
}): ReactNode {
  const query = useContext(SearchContext)
  if (!matches(query, label, description, keywords)) return null
  return (
    <SettingRow label={label} description={description}>
      {children}
    </SettingRow>
  )
}

function Section({ id, children }: { id: string; children: ReactNode }): ReactNode {
  const info = SECTIONS.find((s) => s.id === id)!
  const Icon = info.icon
  return (
    <section id={`st-${id}`} className="st-section" data-section={id}>
      <header className="st-section-head">
        <span className="st-section-icon">
          <Icon size={17} />
        </span>
        <div>
          <h2>{info.label}</h2>
          <p className="tiny">{info.description}</p>
        </div>
      </header>
      <div className="card st-card">{children}</div>
    </section>
  )
}

// ------------------------------------------------------------------ page

export function SettingsPage(): ReactNode {
  const settings = useApp((s) => s.settings)
  const setSettings = useApp((s) => s.setSettings)
  const totalRamMb = useApp((s) => s.totalRamMb)
  const pushNotification = useApp((s) => s.pushNotification)

  const [query, setQuery] = useState('')
  const [active, setActive] = useState('general')
  const [javas, setJavas] = useState<JavaInstall[] | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [version, setVersion] = useState('')
  const [checking, setChecking] = useState(false)
  const [reverting, setReverting] = useState(false)
  const [visibleCount, setVisibleCount] = useState(1)
  const contentRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Semver pre-releases carry a "-" suffix (e.g. 2.3.0-alpha.1).
  const runningPrerelease = version.includes('-')

  useEffect(() => {
    void window.fvc.system.appVersion().then(setVersion)
  }, [])

  useEffect(() => {
    if (javas === null) void window.fvc.java.detect().then(setJavas)
  }, [javas])

  // Highlight the section being read in the side nav.
  useEffect(() => {
    const root = contentRef.current?.closest('.main') ?? null
    const observer = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        const id = (top?.target as HTMLElement | undefined)?.dataset.section
        if (id) setActive(id)
      },
      { root, rootMargin: '-15% 0px -70% 0px' }
    )
    contentRef.current?.querySelectorAll('.st-section').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  // Ctrl/Cmd+F jumps to the settings search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Sections with no matching rows are hidden in CSS; count what's left for the empty state.
  useLayoutEffect(() => {
    setVisibleCount(contentRef.current?.querySelectorAll('.setting-row, .st-extra').length ?? 0)
  })

  const set = (patch: Parameters<typeof setSettings>[0]): void => {
    void setSettings(patch)
  }

  const jumpTo = (id: string): void => {
    setQuery('')
    setActive(id)
    requestAnimationFrame(() => document.getElementById(`st-${id}`)?.scrollIntoView({ block: 'start' }))
  }

  const checkUpdates = (): void => {
    setChecking(true)
    void window.fvc.updater
      .check()
      .catch((err) => pushNotification({ type: 'error', title: 'Update check failed', body: String(err) }))
      .finally(() => setChecking(false))
  }

  const maxRam = Math.max(2048, totalRamMb - 2048)
  const showJavaList = matches(query.trim(), 'detected java runtimes installed', 'java')

  return (
    <SearchContext.Provider value={query.trim()}>
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <div className="subtitle">Changes save automatically.</div>
        </div>
        <div className="pf-search st-search">
          <Search size={16} />
          <input
            ref={searchRef}
            className="input"
            placeholder="Search settings…"
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
      </div>

      <div className={`st-layout ${query.trim() ? 'searching' : ''}`}>
        {/* ------------------------------------------------------------ Nav */}
        <nav className="st-nav">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`st-nav-item ${active === id && !query.trim() ? 'active' : ''}`}
              onClick={() => jumpTo(id)}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
          <div className="st-nav-foot">
            <div className="st-version">
              <span className="tiny">FvC Launcher</span>
              <span className="st-version-number">
                {version ? `v${version}` : '…'}
                {runningPrerelease && <span className="badge warning">alpha</span>}
              </span>
            </div>
            <Button icon={RefreshCw} loading={checking} onClick={checkUpdates} style={{ width: '100%' }}>
              Check for updates
            </Button>
          </div>
        </nav>

        {/* -------------------------------------------------------- Content */}
        <div className="st-content" ref={contentRef}>
          {query.trim() && visibleCount === 0 && (
            <div className="card st-empty">
              <Search size={22} />
              <div>
                <div style={{ fontWeight: 650 }}>No settings match “{query.trim()}”</div>
                <div className="tiny">Try a different word, like “RAM”, “theme” or “Java”.</div>
              </div>
            </div>
          )}

          <Section id="general">
            <Row label="Launch on startup" description="Start FvC Launcher when you log in" keywords="boot autostart">
              <Toggle checked={settings.launchOnStartup} onChange={(v) => set({ launchOnStartup: v })} />
            </Row>
            <Row
              label="Discord Rich Presence"
              description="Show what you're playing on your Discord profile"
              keywords="status activity"
            >
              <Toggle checked={settings.discordRichPresence} onChange={(v) => set({ discordRichPresence: v })} />
            </Row>
            <Row
              label="Ask which account to use"
              description="When you have several accounts, choose one every time you press Play"
              keywords="account picker"
            >
              <Toggle checked={settings.askAccountOnPlay} onChange={(v) => set({ askAccountOnPlay: v })} />
            </Row>
            <Row
              label="After the game starts"
              description="What the launcher window does once Minecraft is running"
              keywords="minimize close window"
            >
              <Select
                value={settings.afterLaunch}
                options={[
                  { value: 'keep', label: 'Stay open' },
                  { value: 'minimize', label: 'Minimize' },
                  { value: 'close', label: 'Close launcher' }
                ]}
                onChange={(v) => set({ afterLaunch: v as never })}
              />
            </Row>
            <Row label="Language" keywords="translation locale">
              <Select
                value={settings.language}
                options={[{ value: 'en', label: 'English' }]}
                onChange={(v) => set({ language: v })}
              />
            </Row>
          </Section>

          <Section id="updates">
            <Row
              label="Check for launcher updates"
              description="Look for a new version of FvC Launcher when it starts"
              keywords="update version"
            >
              <Toggle checked={settings.checkLauncherUpdates} onChange={(v) => set({ checkLauncherUpdates: v })} />
            </Row>
            <Row
              label="Alpha builds"
              description="Also update to pre-releases, so you always get the newest version on GitHub. They can be unstable. Turning this off keeps your current version until a newer stable release is out."
              keywords="beta prerelease channel update"
            >
              <Toggle
                checked={settings.alphaBuilds}
                onChange={(v) => {
                  void setSettings({ alphaBuilds: v }).then(() => {
                    if (v) void window.fvc.updater.check()
                  })
                }}
              />
            </Row>
            {(settings.alphaBuilds || runningPrerelease) && (
              <Row
                label="Revert to latest release"
                description="Turn off alpha builds and install the newest stable release from GitHub, even if it is older than this version."
                keywords="downgrade stable update"
              >
                <Button
                  icon={History}
                  loading={reverting}
                  onClick={() => {
                    setReverting(true)
                    void setSettings({ alphaBuilds: false })
                      .then(() => window.fvc.updater.revertToStable())
                      .finally(() => setReverting(false))
                  }}
                >
                  Revert
                </Button>
              </Row>
            )}
          </Section>

          <Section id="game">
            <Row
              label="Default RAM"
              description={`Used by profiles without their own value · this computer has ${(totalRamMb / 1024).toFixed(0)} GB`}
              keywords="memory ram"
            >
              <div style={{ width: 280 }}>
                <Slider
                  min={1024}
                  max={maxRam}
                  step={512}
                  value={settings.defaultRamMb}
                  onChange={(v) => set({ defaultRamMb: v })}
                  format={(v) => `${(v / 1024).toFixed(1)} GB`}
                />
              </div>
            </Row>
            <Row label="Default resolution" description="Game window size in pixels" keywords="window size width height">
              <div className="st-resolution">
                <input
                  className="input"
                  type="number"
                  value={settings.defaultResolution.width}
                  onChange={(e) =>
                    set({ defaultResolution: { ...settings.defaultResolution, width: Number(e.target.value) || 854 } })
                  }
                />
                <span>×</span>
                <input
                  className="input"
                  type="number"
                  value={settings.defaultResolution.height}
                  onChange={(e) =>
                    set({ defaultResolution: { ...settings.defaultResolution, height: Number(e.target.value) || 480 } })
                  }
                />
              </div>
            </Row>
            <Row label="Fullscreen by default" keywords="window">
              <Toggle checked={settings.defaultFullscreen} onChange={(v) => set({ defaultFullscreen: v })} />
            </Row>
            <Row
              label="Show console on launch"
              description="Open the game log automatically when launching"
              keywords="logs output"
            >
              <Toggle checked={settings.showConsoleOnLaunch} onChange={(v) => set({ showConsoleOnLaunch: v })} />
            </Row>
          </Section>

          <Section id="java">
            <Row
              label="Java version"
              description="Auto detects, downloads and uses the correct Java for each Minecraft version"
              keywords="runtime jre jdk"
            >
              <Select
                value={settings.javaMode}
                options={[
                  { value: 'auto', label: 'Auto (recommended)' },
                  { value: 'manual', label: 'Manual' }
                ]}
                onChange={(v) => set({ javaMode: v as never })}
              />
            </Row>
            {settings.javaMode === 'manual' && (
              <Row
                label="Java executable"
                description={settings.defaultJavaPath || 'No executable selected yet'}
                keywords="java path runtime"
              >
                <div className="row" style={{ gap: 8 }}>
                  {settings.defaultJavaPath && (
                    <Button variant="subtle" onClick={() => set({ defaultJavaPath: '' })}>
                      Clear
                    </Button>
                  )}
                  <Button
                    icon={FolderSearch}
                    onClick={() =>
                      void window.fvc.java
                        .pickExecutable()
                        .then((p) => p && set({ defaultJavaPath: p }))
                        .catch((err) => pushNotification({ type: 'error', title: 'Invalid Java', body: String(err) }))
                    }
                  >
                    {settings.defaultJavaPath ? 'Change' : 'Browse'}
                  </Button>
                </div>
              </Row>
            )}
            <Row
              label="Garbage collector"
              description="JVM GC tuning preset added to launch arguments"
              keywords="gc performance java"
            >
              <Select
                value={settings.gcPreset}
                options={[
                  { value: 'default', label: 'JVM default' },
                  { value: 'g1gc', label: 'G1GC (recommended)' },
                  { value: 'zgc', label: 'ZGC (Java 17+, big heaps)' }
                ]}
                onChange={(v) => set({ gcPreset: v as never })}
              />
            </Row>
            <Row
              label="Default Java arguments"
              description="Applied to every profile before its own arguments"
              keywords="jvm flags args java"
            >
              <input
                className="input st-mono"
                style={{ width: 300 }}
                placeholder="-Dfml.readTimeout=180 …"
                defaultValue={settings.defaultJavaArgs}
                onBlur={(e) => set({ defaultJavaArgs: e.target.value })}
              />
            </Row>
            {showJavaList && (
              <div className="st-extra st-java">
                <div className="row between">
                  <div>
                    <div className="s-label">Detected runtimes</div>
                    <div className="s-desc">Found on this computer or downloaded by the launcher</div>
                  </div>
                  <Button variant="subtle" icon={RefreshCw} onClick={() => setJavas(null)} disabled={javas === null}>
                    Rescan
                  </Button>
                </div>
                {javas === null ? (
                  <div className="row tiny" style={{ gap: 10 }}>
                    <span className="spinner" style={{ color: 'var(--accent)' }} /> Scanning…
                  </div>
                ) : javas.length === 0 ? (
                  <div className="tiny">No Java found. The launcher downloads the right one when you first play.</div>
                ) : (
                  <div className="st-java-list">
                    {javas.map((java) => {
                      const inUse = settings.javaMode === 'manual' && settings.defaultJavaPath === java.path
                      return (
                        <div key={java.path} className={`st-java-item ${inUse ? 'active' : ''}`}>
                          <span className="st-java-version">{java.majorVersion}</span>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div className="s-label">Java {java.majorVersion}</div>
                            <div className="s-desc st-mono st-ellipsis" title={java.path}>
                              {java.path}
                            </div>
                          </div>
                          <span className="badge">{java.source}</span>
                          {settings.javaMode === 'manual' && !inUse && (
                            <Button variant="subtle" onClick={() => set({ defaultJavaPath: java.path })}>
                              Use
                            </Button>
                          )}
                          {inUse && <Check size={16} style={{ color: 'var(--accent)' }} />}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </Section>

          <Section id="appearance">
            <Row label="Theme" description="Color scheme for the whole launcher" keywords="dark light amoled nord midnight colors">
              <div className="st-themes">
                {THEMES.map((theme) => {
                  const on = settings.theme === theme.id
                  return (
                    <button
                      key={theme.id}
                      className={`st-theme ${on ? 'active' : ''}`}
                      onClick={() => set({ theme: theme.id })}
                      title={theme.label}
                    >
                      <span
                        className="st-theme-preview"
                        style={{ background: theme.vars['--bg'], borderColor: theme.vars['--card-hover'] }}
                      >
                        <span className="st-theme-side" style={{ background: theme.vars['--bg-2'] }} />
                        <span className="st-theme-card" style={{ background: theme.vars['--card'] }}>
                          <span style={{ background: settings.accentColor }} />
                          <span style={{ background: theme.vars['--text-2'] }} />
                        </span>
                        {on && (
                          <span className="st-theme-check">
                            <Check size={11} strokeWidth={3} />
                          </span>
                        )}
                      </span>
                      <span className="st-theme-label">{theme.label}</span>
                    </button>
                  )
                })}
              </div>
            </Row>
            <Row label="Accent color" description="Buttons, highlights and selections" keywords="colour color primary">
              <div className="st-swatches">
                {ACCENT_PRESETS.map((color) => {
                  const on = settings.accentColor.toLowerCase() === color.toLowerCase()
                  return (
                    <button
                      key={color}
                      className={`st-swatch ${on ? 'active' : ''}`}
                      style={{ background: color }}
                      onClick={() => set({ accentColor: color })}
                      aria-label={`Accent ${color}`}
                    >
                      {on && <Check size={13} strokeWidth={3} />}
                    </button>
                  )
                })}
                <label className="st-swatch custom" title="Custom color">
                  <input
                    type="color"
                    value={settings.accentColor}
                    onChange={(e) => set({ accentColor: e.target.value })}
                  />
                  <Palette size={13} />
                </label>
              </div>
            </Row>
            <Row
              label="Secondary accent"
              description="Second color of gradients, like the Play button and progress bars"
              keywords="gradient colour color"
            >
              <label className="st-gradient" title="Pick the second color">
                <span style={{ background: `linear-gradient(90deg, ${settings.accentColor}, ${settings.accentColor2})` }} />
                <input
                  type="color"
                  value={settings.accentColor2}
                  onChange={(e) => set({ accentColor2: e.target.value })}
                />
              </label>
            </Row>
            <Row label="UI scale" description="Size of text and controls" keywords="zoom size font">
              <div style={{ width: 240 }}>
                <Slider
                  min={0.85}
                  max={1.2}
                  step={0.05}
                  value={settings.uiScale}
                  onChange={(v) => set({ uiScale: v })}
                  format={(v) => `${Math.round(v * 100)}%`}
                />
              </div>
            </Row>
            <Row label="Compact mode" description="Smaller text and tighter spacing" keywords="density">
              <Toggle checked={settings.compactMode} onChange={(v) => set({ compactMode: v })} />
            </Row>
            <Row label="Icon-only sidebar" description="Collapse the sidebar to a slim icon rail" keywords="navigation menu">
              <Toggle checked={settings.sidebarIconsOnly} onChange={(v) => set({ sidebarIconsOnly: v })} />
            </Row>
            <Row label="Corner radius" description="How rounded cards and buttons are" keywords="rounded">
              <div style={{ width: 240 }}>
                <Slider min={0} max={22} value={settings.cornerRadius} onChange={(v) => set({ cornerRadius: v })} format={(v) => `${v}px`} />
              </div>
            </Row>
            <Row label="Blur intensity" description="Glass effect on the sidebar and dialogs" keywords="transparency glass">
              <div style={{ width: 240 }}>
                <Slider min={0} max={30} value={settings.blurIntensity} onChange={(v) => set({ blurIntensity: v })} format={(v) => String(v)} />
              </div>
            </Row>
            <Row label="Animation speed" keywords="motion transitions">
              <div style={{ width: 240 }}>
                <Slider
                  min={0.5}
                  max={2}
                  step={0.25}
                  value={settings.animationSpeed}
                  onChange={(v) => set({ animationSpeed: v })}
                  format={(v) => `${v}×`}
                />
              </div>
            </Row>
            <Row label="Notification position" keywords="toast alerts">
              <Select
                value={settings.notificationPosition}
                options={[
                  { value: 'top-right', label: 'Top right' },
                  { value: 'bottom-right', label: 'Bottom right' }
                ]}
                onChange={(v) => set({ notificationPosition: v as never })}
              />
            </Row>
            <Row label="Background image" description="Custom image behind the whole launcher" keywords="wallpaper picture">
              <div className="row" style={{ gap: 8 }}>
                {settings.backgroundImage && (
                  <span className="st-bg-thumb" style={{ backgroundImage: `url("${settings.backgroundImage}")` }} />
                )}
                {settings.backgroundImage && (
                  <Button variant="subtle" onClick={() => set({ backgroundImage: '' })}>
                    Clear
                  </Button>
                )}
                <Button
                  icon={Image}
                  onClick={() => void window.fvc.system.pickImage().then((img) => img && set({ backgroundImage: img }))}
                >
                  {settings.backgroundImage ? 'Change' : 'Choose'}
                </Button>
              </div>
            </Row>
            {settings.backgroundImage && (
              <Row label="Background opacity" keywords="wallpaper transparency">
                <div style={{ width: 240 }}>
                  <Slider
                    min={0.05}
                    max={1}
                    step={0.05}
                    value={settings.backgroundOpacity}
                    onChange={(v) => set({ backgroundOpacity: v })}
                    format={(v) => `${Math.round(v * 100)}%`}
                  />
                </div>
              </Row>
            )}
          </Section>

          <Section id="downloads">
            <Row label="Concurrent downloads" description="Files downloaded at the same time" keywords="parallel threads">
              <div style={{ width: 240 }}>
                <Slider min={1} max={16} value={settings.concurrentDownloads} onChange={(v) => set({ concurrentDownloads: v })} format={(v) => String(v)} />
              </div>
            </Row>
            <Row label="Speed limit" description="Cap download speed so the rest of your network stays usable" keywords="bandwidth throttle">
              <div style={{ width: 240 }}>
                <Slider
                  min={0}
                  max={100}
                  step={5}
                  value={settings.speedLimitMbps}
                  onChange={(v) => set({ speedLimitMbps: v })}
                  format={(v) => (v === 0 ? 'Unlimited' : `${v} MB/s`)}
                />
              </div>
            </Row>
            <Row label="Auto-update mods" description="Check installed mods for updates when opening a profile" keywords="modrinth">
              <Toggle checked={settings.autoUpdateMods} onChange={(v) => set({ autoUpdateMods: v })} />
            </Row>
            <Row
              label="CurseForge API key"
              description="Free key from console.curseforge.com. Enables CurseForge modpack search and reliable pack downloads."
              keywords="curseforge token modpack"
            >
              <input
                className="input st-mono"
                style={{ width: 300 }}
                type="password"
                placeholder="Paste your API key…"
                defaultValue={settings.curseforgeApiKey}
                onBlur={(e) => set({ curseforgeApiKey: e.target.value.trim() })}
              />
            </Row>
          </Section>

          <Section id="advanced">
            <Row label="Debug logging" description="Verbose launcher logs, including game verification output" keywords="logs verbose">
              <Toggle checked={settings.debugLogging} onChange={(v) => set({ debugLogging: v })} />
            </Row>
            <Row
              label="Developer mode"
              description="Run several games at the same time, even the same profile with different accounts"
              keywords="multiple instances"
            >
              <Toggle checked={settings.developerMode} onChange={(v) => set({ developerMode: v })} />
            </Row>
            <Row label="Logs folder" description="Launcher and game logs, useful when reporting a bug" keywords="logs files">
              <Button icon={ScrollText} onClick={() => void window.fvc.system.openLogs()}>
                Open logs
              </Button>
            </Row>
            <Row label="Clear cache" description="Removes cached Modrinth data and downloaded installers" keywords="storage space">
              <Button
                icon={Trash2}
                onClick={() =>
                  void window.fvc.system
                    .clearCache()
                    .then(() => pushNotification({ type: 'success', title: 'Cache cleared' }))
                }
              >
                Clear cache
              </Button>
            </Row>
            <Row
              label="Reset settings"
              description="Restores every launcher setting to its default. Profiles and accounts are kept."
              keywords="defaults restore"
            >
              <Button variant="danger" icon={Undo2} onClick={() => setResetOpen(true)}>
                Reset
              </Button>
            </Row>
          </Section>
        </div>
      </div>

      <ConfirmDialog
        open={resetOpen}
        title="Reset all settings?"
        body="Profiles and accounts are kept. Only launcher settings return to defaults."
        confirmLabel="Reset settings"
        danger
        onCancel={() => setResetOpen(false)}
        onConfirm={() => {
          void window.fvc.settings.reset().then(() => {
            setResetOpen(false)
            void useApp.getState().init()
            pushNotification({ type: 'success', title: 'Settings reset' })
          })
        }}
      />
    </SearchContext.Provider>
  )
}
