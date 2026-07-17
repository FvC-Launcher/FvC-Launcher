import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronDown,
  Coffee,
  FolderOpen,
  Maximize2,
  MemoryStick,
  Monitor,
  Play,
  Square,
  Terminal
} from 'lucide-react'
import { Avatar, Button, Modal, Select, Toggle } from '@/components/ui'
import { AddAccountModal } from '@/components/AddAccountModal'
import { useApp, useSelectedProfile } from '@/store'
import { LOADER_LABELS, profileIcon } from '@/lib'

export function PlayPage(): ReactNode {
  const profiles = useApp((s) => s.profiles)
  const selectProfile = useApp((s) => s.selectProfile)
  const navigate = useApp((s) => s.navigate)
  const launch = useApp((s) => s.launch)
  const settings = useApp((s) => s.settings)
  const setSettings = useApp((s) => s.setSettings)
  const accounts = useApp((s) => s.accounts)
  const activeAccountId = useApp((s) => s.activeAccountId)
  const pushNotification = useApp((s) => s.pushNotification)
  const profile = useSelectedProfile()

  const [showConsole, setShowConsole] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [accountPickerOpen, setAccountPickerOpen] = useState(false)
  const [addAccountOpen, setAddAccountOpen] = useState(false)
  const [dontAskAgain, setDontAskAgain] = useState(false)
  const logRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    return window.fvc.launch.onLog((line) => {
      setLogs((prev) => [...prev.slice(-400), line])
    })
  }, [])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [logs, showConsole])

  useEffect(() => {
    if (settings.showConsoleOnLaunch && (launch.phase === 'launching' || launch.phase === 'running')) {
      setShowConsole(true)
    }
  }, [launch.phase, settings.showConsoleOnLaunch])

  const busy = ['verifying', 'java', 'loader', 'assets', 'launching'].includes(launch.phase)
  const running = launch.phase === 'running'

  /**
   * Entry point for the Play button: with no accounts, offer to add one
   * (and continue launching once added); with several, ask which to use.
   */
  const requestStart = (): void => {
    if (!profile) return
    if (accounts.length === 0) {
      setAddAccountOpen(true)
      return
    }
    if (accounts.length > 1 && settings.askAccountOnPlay) {
      setDontAskAgain(false)
      setAccountPickerOpen(true)
      return
    }
    void start()
  }

  const start = async (accountId?: string): Promise<void> => {
    if (!profile) return
    setAccountPickerOpen(false)
    if (accountId) {
      await window.fvc.accounts.setActive(accountId)
      if (dontAskAgain) void setSettings({ askAccountOnPlay: false })
    }
    setLogs([])
    try {
      await window.fvc.launch.start(profile.id)
    } catch {
      // Notification comes from the main process.
    }
  }

  if (!profile) {
    return (
      <div className="play-hero">
        <h1>No profile selected</h1>
        <p className="muted">Create a profile to start playing.</p>
        <Button variant="primary" onClick={() => navigate('profiles')}>
          Go to Profiles
        </Button>
      </div>
    )
  }

  const Icon = profileIcon(profile.icon)
  const resolution = profile.resolution ?? settings.defaultResolution
  const ram = profile.ramMb || settings.defaultRamMb
  const fullscreen = profile.fullscreen ?? settings.defaultFullscreen

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div
        className="play-hero"
        style={
          profile.backgroundImage
            ? {
                backgroundImage: `linear-gradient(180deg, rgba(15,17,21,0.55), rgba(15,17,21,0.9)), url("${profile.backgroundImage}")`,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
              }
            : undefined
        }
      >
        {/* Profile selector */}
        <div style={{ width: 320 }}>
          <Select
            value={profile.id}
            options={profiles.map((p) => ({
              value: p.id,
              label: p.name,
              hint: `${p.minecraftVersion} · ${LOADER_LABELS[p.loader]}`
            }))}
            onChange={(id) => void selectProfile(id)}
          />
        </div>

        <span className="mod-icon" style={{ width: 84, height: 84, borderRadius: 20 }}>
          <Icon size={38} />
        </span>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: '2rem' }}>{profile.name}</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            Minecraft {profile.minecraftVersion} · {LOADER_LABELS[profile.loader]}
            {profile.loaderVersion ? ` ${profile.loaderVersion}` : ''}
          </p>
        </div>

        <AnimatePresence mode="wait">
          {running ? (
            <motion.div key="stop" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
              <button className="btn-play" style={{ background: 'linear-gradient(135deg, #f87171, #fb923c)' }} onClick={() => void window.fvc.launch.kill()}>
                <Square fill="currentColor" strokeWidth={0} /> Stop
              </button>
            </motion.div>
          ) : (
            <motion.div key="play" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
              <button className="btn-play" disabled={busy} onClick={requestStart}>
                {busy ? (
                  <>
                    <span className="spinner" style={{ borderTopColor: '#06131a' }} />
                    {launch.phase === 'launching' ? 'Launching…' : 'Preparing…'}
                  </>
                ) : (
                  <>
                    <Play fill="currentColor" strokeWidth={0} /> Play
                  </>
                )}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {busy && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              style={{ width: 380, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}
            >
              <span className="tiny">{launch.detail}</span>
              <div className="progress" style={{ width: '100%' }}>
                <div
                  className={launch.progress < 0 ? undefined : undefined}
                  style={{ width: launch.progress < 0 ? '100%' : `${launch.progress * 100}%`, opacity: launch.progress < 0 ? 0.35 : 1 }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Quick facts row */}
      <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
        <span className="badge">
          <MemoryStick size={13} /> {(ram / 1024).toFixed(1)} GB RAM
        </span>
        <span className="badge">
          <Coffee size={13} /> {profile.javaPath || settings.defaultJavaPath || 'Auto Java'}
        </span>
        <span className="badge">
          <Monitor size={13} /> {resolution.width}×{resolution.height}
        </span>
        <span className="badge">
          <Maximize2 size={13} /> {fullscreen ? 'Fullscreen' : 'Windowed'}
        </span>
        <div style={{ flex: 1 }} />
        <Button icon={FolderOpen} onClick={() => void window.fvc.profiles.openFolder(profile.id)}>
          Open folder
        </Button>
        <Button
          icon={Terminal}
          variant={showConsole ? 'primary' : 'ghost'}
          onClick={() => setShowConsole((v) => !v)}
        >
          Console
        </Button>
      </div>

      {/* Console */}
      <AnimatePresence>
        {showConsole && (
          <motion.pre
            ref={logRef}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 280 }}
            exit={{ opacity: 0, height: 0 }}
            className="card"
            style={{
              padding: 16,
              overflow: 'auto',
              fontFamily: 'Consolas, monospace',
              fontSize: '0.76rem',
              lineHeight: 1.6,
              color: 'var(--text-2)',
              userSelect: 'text',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all'
            }}
          >
            {logs.length === 0 ? 'Game output will appear here…' : logs.join('\n')}
          </motion.pre>
        )}
      </AnimatePresence>

      {/* Per-profile launch options */}
      <details className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <summary
          className="row between"
          style={{ padding: '14px 18px', cursor: 'pointer', listStyle: 'none', fontWeight: 600, fontSize: '0.9rem' }}
        >
          Launch options for this profile
          <ChevronDown size={16} style={{ color: 'var(--text-3)' }} />
        </summary>
        <ProfileLaunchOptions />
      </details>

      {/* No account yet: same add-account chooser as the Accounts page,
          then continue straight into the launch. */}
      <AddAccountModal
        open={addAccountOpen}
        onClose={() => setAddAccountOpen(false)}
        onAdded={() => void start()}
      />

      {/* Account picker (shown when several accounts exist) */}
      <Modal
        open={accountPickerOpen}
        onClose={() => setAccountPickerOpen(false)}
        title="Play as…"
        footer={
          <label className="row" style={{ gap: 10, cursor: 'pointer', marginRight: 'auto' }}>
            <Toggle checked={dontAskAgain} onChange={setDontAskAgain} />
            <span style={{ fontSize: '0.84rem', color: 'var(--text-2)' }}>
              Don&apos;t ask again — always use the chosen account
            </span>
          </label>
        }
      >
        <div className="modal-body" style={{ gap: 8 }}>
          {accounts.map((account) => (
            <button
              key={account.id}
              className="card hoverable row"
              style={{
                padding: 14,
                gap: 14,
                width: '100%',
                textAlign: 'left',
                outline: account.id === activeAccountId ? '2px solid rgba(var(--accent-rgb), 0.5)' : 'none'
              }}
              onClick={() => void start(account.id)}
            >
              <Avatar username={account.type === 'microsoft' ? account.username : ''} size={44} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>{account.username}</div>
                <div className="tiny" style={{ marginTop: 2 }}>
                  {account.type === 'microsoft' ? 'Microsoft account' : 'Offline account'}
                  {account.id === activeAccountId ? ' · current default' : ''}
                </div>
              </div>
              <Play size={17} style={{ color: 'var(--accent)' }} />
            </button>
          ))}
        </div>
      </Modal>
    </div>
  )
}

function ProfileLaunchOptions(): ReactNode {
  const profile = useSelectedProfile()
  const settings = useApp((s) => s.settings)
  const totalRamMb = useApp((s) => s.totalRamMb)
  if (!profile) return null

  const patch = (p: Parameters<typeof window.fvc.profiles.update>[1]): void => {
    void window.fvc.profiles.update(profile.id, p)
  }
  const resolution = profile.resolution ?? settings.defaultResolution

  return (
    <div>
      <div className="setting-row">
        <div>
          <div className="s-label">Allocated RAM</div>
          <div className="s-desc">Memory available to the game (system has {(totalRamMb / 1024).toFixed(0)} GB)</div>
        </div>
        <div className="s-control" style={{ minWidth: 320 }}>
          <input
            type="range"
            className="slider"
            min={1024}
            max={Math.max(2048, totalRamMb - 2048)}
            step={512}
            value={profile.ramMb}
            onChange={(e) => patch({ ramMb: Number(e.target.value) })}
            style={{ ['--slider-fill' as never]: `${((profile.ramMb - 1024) / (Math.max(2048, totalRamMb - 2048) - 1024)) * 100}%` }}
          />
          <span style={{ minWidth: 64, textAlign: 'right', fontSize: '0.84rem', fontWeight: 600 }}>
            {(profile.ramMb / 1024).toFixed(1)} GB
          </span>
        </div>
      </div>
      <div className="setting-row">
        <div>
          <div className="s-label">Game resolution</div>
        </div>
        <div className="s-control row" style={{ gap: 8 }}>
          <input
            className="input"
            style={{ width: 84 }}
            type="number"
            value={resolution.width}
            onChange={(e) => patch({ resolution: { ...resolution, width: Number(e.target.value) || 854 } })}
          />
          ×
          <input
            className="input"
            style={{ width: 84 }}
            type="number"
            value={resolution.height}
            onChange={(e) => patch({ resolution: { ...resolution, height: Number(e.target.value) || 480 } })}
          />
        </div>
      </div>
      <div className="setting-row">
        <div>
          <div className="s-label">Fullscreen</div>
        </div>
        <div className="s-control">
          <Toggle
            checked={profile.fullscreen ?? settings.defaultFullscreen}
            onChange={(v) => patch({ fullscreen: v })}
          />
        </div>
      </div>
      <div className="setting-row">
        <div>
          <div className="s-label">Java arguments</div>
          <div className="s-desc">Extra JVM flags appended to the launch command</div>
        </div>
        <div className="s-control" style={{ minWidth: 340 }}>
          <input
            className="input"
            placeholder="-XX:+UseG1GC …"
            defaultValue={profile.javaArgs ?? ''}
            onBlur={(e) => patch({ javaArgs: e.target.value })}
          />
        </div>
      </div>
    </div>
  )
}
