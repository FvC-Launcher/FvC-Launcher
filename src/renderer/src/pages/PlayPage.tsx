import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Coffee,
  Copy,
  Eraser,
  FolderOpen,
  Github,
  Maximize2,
  MemoryStick,
  Monitor,
  Package,
  Play,
  SlidersHorizontal,
  Square,
  Terminal,
  type LucideIcon
} from 'lucide-react'
import { Avatar, Button, EmptyState, Modal, Select, Toggle } from '@/components/ui'
import { AddAccountModal } from '@/components/AddAccountModal'
import { ProfileCover } from '@/components/ProfileCover'
import { useApp, useSelectedProfile } from '@/store'
import { LOADER_LABELS, PREPARING_PHASES, profileIcon } from '@/lib'
import type { LaunchPhase } from '@shared/types'

const STEPS: { phase: LaunchPhase; label: string }[] = [
  { phase: 'verifying', label: 'Verify' },
  { phase: 'java', label: 'Java' },
  { phase: 'loader', label: 'Loader' },
  { phase: 'assets', label: 'Assets' },
  { phase: 'launching', label: 'Launch' }
]

function formatUptime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** Re-renders every second while `active`, for live uptime counters. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [active])
  return now
}

export function PlayPage(): ReactNode {
  const profiles = useApp((s) => s.profiles)
  const selectProfile = useApp((s) => s.selectProfile)
  const openProfile = useApp((s) => s.openProfile)
  const navigate = useApp((s) => s.navigate)
  const launches = useApp((s) => s.launches)
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
  const [optionsOpen, setOptionsOpen] = useState(false)
  const logRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    return window.fvc.launch.onLog((line) => {
      setLogs((prev) => [...prev.slice(-400), line])
    })
  }, [])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [logs, showConsole])

  const devMode = settings.developerMode
  const mine = launches.filter((l) => l.profileId === profile?.id)
  const preparing = mine.find((l) => PREPARING_PHASES.includes(l.phase))
  const runningHere = mine.filter((l) => l.phase === 'running')
  // Only one launch may prepare at a time, whichever profile it is for.
  const preparingElsewhere = !preparing && launches.some((l) => PREPARING_PHASES.includes(l.phase))
  const busy = !!preparing
  // Without developer mode a running game turns Play into Stop.
  const showStop = !devMode && runningHere.length > 0
  const now = useNow(runningHere.length > 0)
  const activeAccount = accounts.find((a) => a.id === activeAccountId) ?? null

  useEffect(() => {
    if (
      settings.showConsoleOnLaunch &&
      (preparing?.phase === 'launching' || runningHere.length > 0)
    ) {
      setShowConsole(true)
    }
  }, [preparing?.phase, runningHere.length, settings.showConsoleOnLaunch])

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

  const copyLogs = (): void => {
    void navigator.clipboard
      .writeText(logs.join('\n'))
      .then(() => pushNotification({ type: 'success', title: 'Console output copied' }))
      .catch(() => pushNotification({ type: 'error', title: 'Could not copy console output' }))
  }

  if (!profile) {
    return (
      <EmptyState
        icon={Package}
        title="No profile selected"
        hint="Create a profile to choose a Minecraft version, loader and mods."
        action={
          <Button variant="primary" onClick={() => navigate('profiles')}>
            Go to Profiles
          </Button>
        }
      />
    )
  }

  const Icon = profileIcon(profile.icon)
  const resolution = profile.resolution ?? settings.defaultResolution
  const ram = profile.ramMb || settings.defaultRamMb
  const fullscreen = profile.fullscreen ?? settings.defaultFullscreen
  const javaLabel = profile.javaPath || settings.defaultJavaPath || 'Automatic'
  const stepIndex = preparing ? STEPS.findIndex((s) => s.phase === preparing.phase) : -1
  const firstStart = runningHere.reduce<number | undefined>(
    (min, l) => (l.startedAt && (!min || l.startedAt < min) ? l.startedAt : min),
    undefined
  )

  return (
    <div className="stack" style={{ gap: 18 }}>
      {/* ------------------------------------------------------------ Hero */}
      <section className="play-stage">
        <ProfileCover profile={profile} />

        <div className="play-top">
          <div className="play-switch">
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
          <div className="row" style={{ gap: 8 }}>
            <button
              className="pf-glass-btn lg"
              title="Open folder"
              aria-label="Open folder"
              onClick={() => void window.fvc.profiles.openFolder(profile.id)}
            >
              <FolderOpen size={16} />
            </button>
            <button className="pf-back play-manage" onClick={() => openProfile(profile.id)}>
              Manage profile <ChevronRight size={15} />
            </button>
          </div>
        </div>

        <div className="play-main">
          <div className="play-identity">
            <span className="pf-hero-icon">
              <Icon size={32} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div className={`pf-hero-label ${runningHere.length ? 'running' : ''}`}>
                {runningHere.length > 0 ? (
                  <>
                    <span className="dot" />
                    {runningHere.length > 1 ? `${runningHere.length} instances running` : 'Running'}
                    {firstStart ? ` · ${formatUptime(now - firstStart)}` : ''}
                  </>
                ) : preparing ? (
                  'Starting up'
                ) : (
                  'Ready to play'
                )}
              </div>
              <h1 className="play-title" title={profile.name}>
                {profile.name}
              </h1>
              <div className="home-chips">
                <span className="home-chip">Minecraft {profile.minecraftVersion}</span>
                <span className="home-chip">
                  {LOADER_LABELS[profile.loader]}
                  {profile.loaderVersion ? ` ${profile.loaderVersion}` : ''}
                </span>
                {profile.packSource && (
                  <span className="home-chip" title={`Auto-updates from github.com/${profile.packSource.repo}`}>
                    <Github size={12} /> {profile.packSource.installedTag ?? 'Auto-update'}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="play-cta">
            <AnimatePresence mode="wait" initial={false}>
              {showStop ? (
                <motion.button
                  key="stop"
                  className="btn-play play-btn stop"
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  onClick={() => runningHere.forEach((l) => void window.fvc.launch.kill(l.sessionId))}
                >
                  <Square fill="currentColor" strokeWidth={0} /> Stop
                </motion.button>
              ) : (
                <motion.button
                  key="play"
                  className="btn-play play-btn"
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  disabled={busy || preparingElsewhere}
                  title={preparingElsewhere ? 'Another game is still starting' : undefined}
                  onClick={requestStart}
                >
                  {busy ? (
                    <>
                      <span className="spinner" />
                      {preparing?.phase === 'launching' ? 'Launching…' : 'Preparing…'}
                    </>
                  ) : (
                    <>
                      <Play fill="currentColor" strokeWidth={0} />
                      {devMode && runningHere.length > 0 ? 'Play another' : 'Play'}
                    </>
                  )}
                </motion.button>
              )}
            </AnimatePresence>

            <button
              className="play-account"
              onClick={() => navigate('accounts')}
              title="Manage accounts"
            >
              {activeAccount ? (
                <>
                  <Avatar
                    username={activeAccount.type === 'microsoft' ? activeAccount.username : ''}
                    size={22}
                    radius={6}
                  />
                  <span>
                    Playing as <strong>{activeAccount.username}</strong>
                  </span>
                </>
              ) : (
                <span>No account — add one to play</span>
              )}
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {/* Launch progress, docked to the bottom of the banner */}
        <AnimatePresence initial={false}>
          {preparing && (
            <motion.div
              className="play-progress"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <div className="play-progress-inner">
                <div className="play-steps">
                  {STEPS.map((step, i) => (
                    <span
                      key={step.phase}
                      className={`play-step ${i < stepIndex ? 'done' : i === stepIndex ? 'current' : ''}`}
                    >
                      <span className="play-step-dot">{i < stepIndex && <Check size={10} strokeWidth={3} />}</span>
                      {step.label}
                    </span>
                  ))}
                </div>
                <div className="play-progress-detail tiny">
                  <span>{preparing.detail}</span>
                  {preparing.progress >= 0 && <span>{Math.round(preparing.progress * 100)}%</span>}
                </div>
                <div className={`progress ${preparing.progress < 0 ? 'indeterminate' : ''}`}>
                  <div style={{ width: preparing.progress < 0 ? undefined : `${preparing.progress * 100}%` }} />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* ---------------------------------------------------- Quick facts */}
      <div className="play-facts">
        <Fact icon={MemoryStick} label="Memory" value={`${(ram / 1024).toFixed(1)} GB`} />
        <Fact icon={Coffee} label="Java" value={javaLabel} mono={javaLabel !== 'Automatic'} />
        <Fact icon={Monitor} label="Resolution" value={`${resolution.width} × ${resolution.height}`} />
        <Fact icon={Maximize2} label="Window" value={fullscreen ? 'Fullscreen' : 'Windowed'} />
      </div>

      {/* ----------------------------------------------- Running instances */}
      {devMode && runningHere.length > 0 && (
        <div className="card play-card">
          <div className="play-card-head">
            <span className="play-card-title">
              <span className="play-live-dot" /> Running instances
            </span>
            <span className="tiny">{runningHere.length}</span>
          </div>
          <div className="play-instances">
            {runningHere.map((l, i) => (
              <div key={l.sessionId} className="play-instance">
                <span className="play-instance-num">{i + 1}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                    {l.accountName ?? `Instance ${i + 1}`}
                  </div>
                  <div className="tiny">
                    {l.pid ? `PID ${l.pid}` : 'Starting'}
                    {l.startedAt ? ` · up ${formatUptime(now - l.startedAt)}` : ''}
                  </div>
                </div>
                <Button variant="danger" icon={Square} onClick={() => void window.fvc.launch.kill(l.sessionId)}>
                  Stop
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --------------------------------------------------------- Console */}
      <div className={`card play-card play-console ${showConsole ? 'open' : ''}`}>
        <div className="play-card-head">
          <button className="play-card-toggle" onClick={() => setShowConsole((v) => !v)} aria-expanded={showConsole}>
            <span className="play-card-title">
              <Terminal size={15} /> Console
            </span>
            {logs.length > 0 && <span className="badge">{logs.length} lines</span>}
            <ChevronDown size={16} className="play-chev" />
          </button>
          {showConsole && (
            <div className="row" style={{ gap: 6 }}>
              <Button variant="subtle" icon={Copy} disabled={!logs.length} onClick={copyLogs} title="Copy output" aria-label="Copy output" />
              <Button variant="subtle" icon={Eraser} disabled={!logs.length} onClick={() => setLogs([])} title="Clear" aria-label="Clear" />
            </div>
          )}
        </div>
        <AnimatePresence initial={false}>
          {showConsole && (
            <motion.pre
              ref={logRef}
              className="play-log"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 300 }}
              exit={{ opacity: 0, height: 0 }}
            >
              {logs.length === 0 ? (
                <span className="play-log-empty">Game output will appear here…</span>
              ) : (
                logs.map((line, i) => (
                  <span key={i} className={logLevel(line)}>
                    {line}
                    {'\n'}
                  </span>
                ))
              )}
            </motion.pre>
          )}
        </AnimatePresence>
      </div>

      {/* ------------------------------------------------- Launch options */}
      <div className={`card play-card ${optionsOpen ? 'open' : ''}`}>
        <div className="play-card-head">
          <button className="play-card-toggle" onClick={() => setOptionsOpen((v) => !v)} aria-expanded={optionsOpen}>
            <span className="play-card-title">
              <SlidersHorizontal size={15} /> Launch options
            </span>
            <span className="tiny">Memory, resolution and Java flags for this profile</span>
            <ChevronDown size={16} className="play-chev" />
          </button>
        </div>
        <AnimatePresence initial={false}>
          {optionsOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{ overflow: 'hidden' }}
            >
              <ProfileLaunchOptions />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

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

function logLevel(line: string): string {
  if (/\b(ERROR|FATAL|Exception)\b/.test(line)) return 'log-error'
  if (/\bWARN(ING)?\b/.test(line)) return 'log-warn'
  return ''
}

function Fact({
  icon: Icon,
  label,
  value,
  mono
}: {
  icon: LucideIcon
  label: string
  value: string
  mono?: boolean
}): ReactNode {
  return (
    <div className="play-fact">
      <span className="play-fact-icon">
        <Icon size={16} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="pf-hero-stat-label">{label}</div>
        <div className={`play-fact-value ${mono ? 'mono' : ''}`} title={value}>
          {value}
        </div>
      </div>
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
    <div className="play-options">
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
