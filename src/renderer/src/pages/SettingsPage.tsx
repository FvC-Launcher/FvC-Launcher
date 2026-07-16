import { useEffect, useState, type ReactNode } from 'react'
import {
  Coffee,
  FolderSearch,
  Image,
  ScrollText,
  Trash2,
  Undo2
} from 'lucide-react'
import { Button, ConfirmDialog, Select, SettingRow, Slider, Tabs, Toggle } from '@/components/ui'
import { useApp } from '@/store'
import type { JavaInstall } from '@shared/types'

const ACCENT_PRESETS = ['#3BCBFF', '#7B5BFF', '#34D399', '#FBBF24', '#F87171', '#FF7AC6']

export function SettingsPage(): ReactNode {
  const settings = useApp((s) => s.settings)
  const setSettings = useApp((s) => s.setSettings)
  const totalRamMb = useApp((s) => s.totalRamMb)
  const pushNotification = useApp((s) => s.pushNotification)

  const [section, setSection] = useState('general')
  const [javas, setJavas] = useState<JavaInstall[] | null>(null)
  const [resetOpen, setResetOpen] = useState(false)

  useEffect(() => {
    if (section === 'minecraft' && javas === null) {
      void window.fvc.java.detect().then(setJavas)
    }
  }, [section, javas])

  const set = (patch: Parameters<typeof setSettings>[0]): void => {
    void setSettings(patch)
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <div className="subtitle">Defaults apply to every profile unless the profile overrides them.</div>
        </div>
      </div>

      <div className="stack" style={{ gap: 18 }}>
        <Tabs
          tabs={[
            { id: 'general', label: 'General' },
            { id: 'minecraft', label: 'Minecraft' },
            { id: 'appearance', label: 'Appearance' },
            { id: 'downloads', label: 'Downloads' },
            { id: 'advanced', label: 'Advanced' }
          ]}
          active={section}
          onChange={setSection}
        />

        {section === 'general' && (
          <div className="card">
            <SettingRow label="Launch on startup" description="Start FvC Launcher when you log in">
              <Toggle checked={settings.launchOnStartup} onChange={(v) => set({ launchOnStartup: v })} />
            </SettingRow>
            <SettingRow label="Check for launcher updates">
              <Toggle checked={settings.checkLauncherUpdates} onChange={(v) => set({ checkLauncherUpdates: v })} />
            </SettingRow>
            <SettingRow
              label="Ask which account to use"
              description="When you have several accounts, choose one every time you press Play"
            >
              <Toggle checked={settings.askAccountOnPlay} onChange={(v) => set({ askAccountOnPlay: v })} />
            </SettingRow>
            <SettingRow label="After the game starts" description="What the launcher window does once Minecraft is running">
              <Select
                value={settings.afterLaunch}
                options={[
                  { value: 'keep', label: 'Stay open' },
                  { value: 'minimize', label: 'Minimize' },
                  { value: 'close', label: 'Close launcher' }
                ]}
                onChange={(v) => set({ afterLaunch: v as never })}
              />
            </SettingRow>
            <SettingRow label="Language">
              <Select
                value={settings.language}
                options={[{ value: 'en', label: 'English' }]}
                onChange={(v) => set({ language: v })}
              />
            </SettingRow>
          </div>
        )}

        {section === 'minecraft' && (
          <>
            <div className="card">
              <SettingRow
                label="Default RAM"
                description={`Used by profiles without their own value · system has ${(totalRamMb / 1024).toFixed(0)} GB`}
              >
                <div style={{ width: 300 }}>
                  <Slider
                    min={1024}
                    max={Math.max(2048, totalRamMb - 2048)}
                    step={512}
                    value={settings.defaultRamMb}
                    onChange={(v) => set({ defaultRamMb: v })}
                    format={(v) => `${(v / 1024).toFixed(1)} GB`}
                  />
                </div>
              </SettingRow>
              <SettingRow label="Default resolution">
                <div className="row" style={{ gap: 8 }}>
                  <input
                    className="input"
                    style={{ width: 84 }}
                    type="number"
                    value={settings.defaultResolution.width}
                    onChange={(e) =>
                      set({ defaultResolution: { ...settings.defaultResolution, width: Number(e.target.value) || 854 } })
                    }
                  />
                  ×
                  <input
                    className="input"
                    style={{ width: 84 }}
                    type="number"
                    value={settings.defaultResolution.height}
                    onChange={(e) =>
                      set({ defaultResolution: { ...settings.defaultResolution, height: Number(e.target.value) || 480 } })
                    }
                  />
                </div>
              </SettingRow>
              <SettingRow label="Fullscreen by default">
                <Toggle checked={settings.defaultFullscreen} onChange={(v) => set({ defaultFullscreen: v })} />
              </SettingRow>
              <SettingRow label="Garbage collector" description="JVM GC tuning preset added to launch arguments">
                <Select
                  value={settings.gcPreset}
                  options={[
                    { value: 'default', label: 'JVM default' },
                    { value: 'g1gc', label: 'G1GC (recommended)' },
                    { value: 'zgc', label: 'ZGC (Java 17+, big heaps)' }
                  ]}
                  onChange={(v) => set({ gcPreset: v as never })}
                />
              </SettingRow>
              <SettingRow label="Default Java arguments" description="Applied to every profile before its own arguments">
                <input
                  className="input"
                  style={{ width: 320 }}
                  placeholder="-Dfml.readTimeout=180 …"
                  defaultValue={settings.defaultJavaArgs}
                  onBlur={(e) => set({ defaultJavaArgs: e.target.value })}
                />
              </SettingRow>
              <SettingRow
                label="Java version"
                description="Auto detects, downloads and uses the correct Java for each Minecraft version (8 / 16 / 17 / 21)"
              >
                <Select
                  value={settings.javaMode}
                  options={[
                    { value: 'auto', label: 'Auto (recommended)' },
                    { value: 'manual', label: 'Manual' }
                  ]}
                  onChange={(v) => set({ javaMode: v as never })}
                />
              </SettingRow>
              {settings.javaMode === 'manual' && (
                <SettingRow
                  label="Java executable"
                  description={settings.defaultJavaPath || 'No executable selected yet'}
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
                </SettingRow>
              )}
              <SettingRow label="Show console on launch" description="Open the game log automatically when launching">
                <Toggle checked={settings.showConsoleOnLaunch} onChange={(v) => set({ showConsoleOnLaunch: v })} />
              </SettingRow>
            </div>

            <div className="card">
              <div className="setting-row">
                <div>
                  <div className="s-label">Detected Java runtimes</div>
                  <div className="s-desc">Found on this system and managed by the launcher</div>
                </div>
                <Button variant="subtle" onClick={() => setJavas(null)}>
                  Rescan
                </Button>
              </div>
              {javas === null ? (
                <div className="setting-row">
                  <span className="spinner" style={{ color: 'var(--accent)' }} />
                </div>
              ) : javas.length === 0 ? (
                <div className="setting-row">
                  <span className="muted" style={{ fontSize: '0.85rem' }}>
                    No Java found — the launcher will download one automatically when needed.
                  </span>
                </div>
              ) : (
                javas.map((java) => (
                  <div key={java.path} className="setting-row">
                    <div className="row" style={{ gap: 10 }}>
                      <Coffee size={16} style={{ color: 'var(--accent)' }} />
                      <div>
                        <div className="s-label">Java {java.majorVersion}</div>
                        <div className="s-desc" style={{ fontFamily: 'Consolas, monospace' }}>{java.path}</div>
                      </div>
                    </div>
                    <span className="badge">{java.source}</span>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {section === 'appearance' && (
          <div className="card">
            <SettingRow label="Accent color">
              <div className="row" style={{ gap: 8 }}>
                {ACCENT_PRESETS.map((color) => (
                  <button
                    key={color}
                    onClick={() => set({ accentColor: color })}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 8,
                      background: color,
                      outline: settings.accentColor === color ? '2px solid #fff' : 'none',
                      outlineOffset: 2
                    }}
                    aria-label={`Accent ${color}`}
                  />
                ))}
                <input
                  type="color"
                  value={settings.accentColor}
                  onChange={(e) => set({ accentColor: e.target.value })}
                  style={{ width: 34, height: 26, border: 'none', background: 'none', cursor: 'pointer' }}
                />
              </div>
            </SettingRow>
            <SettingRow label="Corner radius">
              <div style={{ width: 260 }}>
                <Slider min={0} max={22} value={settings.cornerRadius} onChange={(v) => set({ cornerRadius: v })} format={(v) => `${v}px`} />
              </div>
            </SettingRow>
            <SettingRow label="Blur intensity" description="Glass effect strength on the sidebar and dialogs">
              <div style={{ width: 260 }}>
                <Slider min={0} max={30} value={settings.blurIntensity} onChange={(v) => set({ blurIntensity: v })} format={(v) => String(v)} />
              </div>
            </SettingRow>
            <SettingRow label="Animation speed">
              <div style={{ width: 260 }}>
                <Slider
                  min={0.5}
                  max={2}
                  step={0.25}
                  value={settings.animationSpeed}
                  onChange={(v) => set({ animationSpeed: v })}
                  format={(v) => `${v}×`}
                />
              </div>
            </SettingRow>
            <SettingRow label="Compact mode" description="Smaller text and tighter spacing">
              <Toggle checked={settings.compactMode} onChange={(v) => set({ compactMode: v })} />
            </SettingRow>
            <SettingRow label="Background image" description="Custom image behind the whole launcher">
              <div className="row" style={{ gap: 8 }}>
                {settings.backgroundImage && (
                  <Button variant="subtle" onClick={() => set({ backgroundImage: '' })}>
                    Clear
                  </Button>
                )}
                <Button
                  icon={Image}
                  onClick={() => void window.fvc.system.pickImage().then((img) => img && set({ backgroundImage: img }))}
                >
                  Choose
                </Button>
              </div>
            </SettingRow>
            {settings.backgroundImage && (
              <SettingRow label="Background opacity">
                <div style={{ width: 260 }}>
                  <Slider
                    min={0.05}
                    max={1}
                    step={0.05}
                    value={settings.backgroundOpacity}
                    onChange={(v) => set({ backgroundOpacity: v })}
                    format={(v) => `${Math.round(v * 100)}%`}
                  />
                </div>
              </SettingRow>
            )}
          </div>
        )}

        {section === 'downloads' && (
          <div className="card">
            <SettingRow label="Concurrent downloads">
              <div style={{ width: 260 }}>
                <Slider min={1} max={16} value={settings.concurrentDownloads} onChange={(v) => set({ concurrentDownloads: v })} format={(v) => String(v)} />
              </div>
            </SettingRow>
            <SettingRow label="Speed limit" description="0 means unlimited">
              <div style={{ width: 260 }}>
                <Slider
                  min={0}
                  max={100}
                  step={5}
                  value={settings.speedLimitMbps}
                  onChange={(v) => set({ speedLimitMbps: v })}
                  format={(v) => (v === 0 ? 'Unlimited' : `${v} MB/s`)}
                />
              </div>
            </SettingRow>
            <SettingRow label="Auto-update mods" description="Check installed mods for updates when opening a profile">
              <Toggle checked={settings.autoUpdateMods} onChange={(v) => set({ autoUpdateMods: v })} />
            </SettingRow>
            <SettingRow
              label="CurseForge API key"
              description="Free key from console.curseforge.com — enables CurseForge modpack search and reliable pack downloads"
            >
              <input
                className="input"
                style={{ width: 320 }}
                type="password"
                placeholder="Paste your API key…"
                defaultValue={settings.curseforgeApiKey}
                onBlur={(e) => set({ curseforgeApiKey: e.target.value.trim() })}
              />
            </SettingRow>
          </div>
        )}

        {section === 'advanced' && (
          <div className="card">
            <SettingRow label="Debug logging" description="Verbose launcher logs, including game verification output">
              <Toggle checked={settings.debugLogging} onChange={(v) => set({ debugLogging: v })} />
            </SettingRow>
            <SettingRow label="Developer mode">
              <Toggle checked={settings.developerMode} onChange={(v) => set({ developerMode: v })} />
            </SettingRow>
            <SettingRow label="Open logs folder">
              <Button icon={ScrollText} onClick={() => void window.fvc.system.openLogs()}>
                Open logs
              </Button>
            </SettingRow>
            <SettingRow label="Clear cache" description="Removes cached Modrinth data and downloaded installers">
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
            </SettingRow>
            <SettingRow label="Reset settings" description="Restores every launcher setting to its default value">
              <Button variant="danger" icon={Undo2} onClick={() => setResetOpen(true)}>
                Reset
              </Button>
            </SettingRow>
          </div>
        )}
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
    </>
  )
}
