import { app } from 'electron'
import { createConnection, type Socket } from 'net'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { profilesService } from './profiles'
import { settingsService } from './settings'
import { LOADER_LABELS, type LaunchPhase, type LaunchState, type Page } from '@shared/types'

/**
 * Discord application (discord.com/developers/applications). Its name, "FvC
 * Launcher", is what Discord shows after "Playing". Empty disables Rich Presence.
 */
const CLIENT_ID: string = '1552030531225522417'
const ICON_URL = 'https://raw.githubusercontent.com/FvC-Launcher/FvC-Launcher/main/build/icon.png'
const DOWNLOAD_URL = 'https://github.com/FvC-Launcher/FvC-Launcher/releases/latest'
/** How often to look for Discord again when it isn't running. */
const RETRY_MS = 20_000
/** Discord accepts 5 activity updates per 20 s; bursts (page clicks, launch phases) are coalesced. */
const MIN_INTERVAL_MS = 4_000
const COALESCE_MS = 500

// Frame opcodes of Discord's local IPC protocol.
const OP_HANDSHAKE = 0
const OP_FRAME = 1
const OP_CLOSE = 2
const OP_PING = 3
const OP_PONG = 4

// Which field the member list shows after "Playing".
const SHOW_NAME = 0
const SHOW_DETAILS = 2

const PREPARING: LaunchPhase[] = ['verifying', 'java', 'loader', 'assets', 'launching']

/** What the idle presence says about the page the launcher is on. */
const PAGE_STATUS: Record<Page, string> = {
  home: 'In the main menu',
  play: 'Picking something to play',
  profiles: 'Managing profiles',
  mods: 'Browsing mods',
  downloads: 'Watching downloads',
  accounts: 'Managing accounts',
  skin: 'Changing skins',
  settings: 'Tweaking settings',
  about: 'Reading about the launcher'
}

interface Activity {
  type: 0
  status_display_type: number
  details: string
  state?: string
  timestamps?: { start: number }
  assets: { large_image: string; large_text: string }
  buttons: { label: string; url: string }[]
}

let socket: Socket | null = null
let connecting = false
let ready = false
let retryTimer: NodeJS.Timeout | null = null
let flushTimer: NodeJS.Timeout | null = null
/** Activity last sent on this connection, serialized, to skip identical updates. */
let lastSent: string | null = null
let lastSentAt = 0

let launches: LaunchState[] = []
let page: Page = 'home'

function enabled(): boolean {
  return CLIENT_ID !== '' && settingsService.get().discordRichPresence
}

/** Discord caps details/state at 128 characters. */
function clip(text: string): string {
  return text.length > 128 ? text.slice(0, 127) + '…' : text
}

function buildActivity(): Activity {
  const base = {
    type: 0 as const,
    assets: { large_image: ICON_URL, large_text: `FvC Launcher ${app.getVersion()}` },
    buttons: [{ label: 'Get FvC Launcher', url: DOWNLOAD_URL }]
  }

  // In developer mode several games can run; show the one that started first.
  const running = launches
    .filter((s) => s.phase === 'running')
    .sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0))
  const game = running[0] && profilesService.get(running[0].profileId)
  if (game) {
    const more = running.length > 1 ? ` (+${running.length - 1} more)` : ''
    return {
      ...base,
      status_display_type: SHOW_DETAILS,
      details: `Minecraft ${game.minecraftVersion} on FvC Launcher`,
      state: clip(`${LOADER_LABELS[game.loader]} · ${game.name}${more}`),
      ...(running[0].startedAt ? { timestamps: { start: running[0].startedAt } } : {})
    }
  }

  const starting = launches.find((s) => PREPARING.includes(s.phase))
  const next = starting && profilesService.get(starting.profileId)
  if (next) {
    return {
      ...base,
      status_display_type: SHOW_NAME,
      details: `Starting Minecraft ${next.minecraftVersion}`,
      state: clip(`${LOADER_LABELS[next.loader]} · ${next.name}`)
    }
  }

  return { ...base, status_display_type: SHOW_NAME, details: 'Idle on FvC Launcher', state: PAGE_STATUS[page] }
}

function write(op: number, payload: unknown): void {
  const body = Buffer.from(JSON.stringify(payload), 'utf-8')
  const header = Buffer.alloc(8)
  header.writeInt32LE(op, 0)
  header.writeInt32LE(body.length, 4)
  socket?.write(Buffer.concat([header, body]))
}

function flush(): void {
  if (!socket || !ready) return
  const activity = buildActivity()
  const serialized = JSON.stringify(activity)
  if (serialized === lastSent) return
  lastSent = serialized
  lastSentAt = Date.now()
  write(OP_FRAME, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity }, nonce: randomUUID() })
}

function scheduleFlush(): void {
  if (flushTimer || !ready) return
  const wait = Math.max(COALESCE_MS, lastSentAt + MIN_INTERVAL_MS - Date.now())
  flushTimer = setTimeout(() => {
    flushTimer = null
    flush()
  }, wait)
}

function scheduleRetry(): void {
  if (retryTimer || !enabled()) return
  retryTimer = setTimeout(() => {
    retryTimer = null
    void connect()
  }, RETRY_MS)
  retryTimer.unref()
}

/** Every place a Discord client may listen; Flatpak and Snap installs use their own dirs. */
function ipcPaths(): string[] {
  const out: string[] = []
  const base = process.env['XDG_RUNTIME_DIR'] || process.env['TMPDIR'] || '/tmp'
  for (let i = 0; i < 10; i++) {
    if (process.platform === 'win32') {
      out.push(`\\\\?\\pipe\\discord-ipc-${i}`)
      continue
    }
    for (const dir of ['', 'app/com.discordapp.Discord', 'snap.discord', '.flatpak/dev.vencord.Vesktop/xdg-run']) {
      out.push(join(base, dir, `discord-ipc-${i}`))
    }
  }
  return out
}

function tryConnect(path: string): Promise<Socket | null> {
  return new Promise((resolve) => {
    const s = createConnection(path)
    s.once('connect', () => {
      s.removeAllListeners('error')
      resolve(s)
    })
    s.once('error', () => {
      s.destroy()
      resolve(null)
    })
  })
}

function handle(op: number, body: string): void {
  let msg: { cmd?: string; evt?: string; message?: string; data?: { message?: string } }
  try {
    msg = JSON.parse(body)
  } catch {
    return
  }
  if (op === OP_PING) {
    write(OP_PONG, msg)
  } else if (op === OP_CLOSE) {
    console.warn('[discord] connection refused:', msg.message ?? body)
    socket?.destroy()
  } else if (op === OP_FRAME && msg.evt === 'READY') {
    ready = true
    flush()
  } else if (op === OP_FRAME && msg.evt === 'ERROR') {
    console.warn('[discord]', msg.data?.message ?? body)
  }
}

function attach(s: Socket): void {
  socket = s
  let pending = Buffer.alloc(0)
  s.on('data', (chunk: Buffer) => {
    pending = Buffer.concat([pending, chunk])
    while (pending.length >= 8) {
      const length = pending.readInt32LE(4)
      if (pending.length < 8 + length) break
      handle(pending.readInt32LE(0), pending.subarray(8, 8 + length).toString('utf-8'))
      pending = pending.subarray(8 + length)
    }
  })
  s.on('error', () => s.destroy())
  s.on('close', () => {
    if (socket !== s) return
    socket = null
    ready = false
    lastSent = null
    scheduleRetry()
  })
  write(OP_HANDSHAKE, { v: 1, client_id: CLIENT_ID })
}

async function connect(): Promise<void> {
  if (socket || connecting || !enabled()) return
  connecting = true
  try {
    for (const path of ipcPaths()) {
      const s = await tryConnect(path)
      if (!s) continue
      // Turned off while we were still looking.
      if (enabled()) attach(s)
      else s.destroy()
      return
    }
  } finally {
    connecting = false
  }
  scheduleRetry()
}

/** Closing the pipe makes Discord drop our activity right away. */
function disconnect(): void {
  if (retryTimer) clearTimeout(retryTimer)
  if (flushTimer) clearTimeout(flushTimer)
  retryTimer = flushTimer = null
  socket?.destroy()
}

export const discordService = {
  init(): void {
    void connect()
  },

  /** Re-read the setting: connect when turned on, clear the presence when turned off. */
  refresh(): void {
    if (enabled()) void connect()
    else disconnect()
  },

  setLaunches(sessions: LaunchState[]): void {
    launches = sessions
    scheduleFlush()
  },

  setPage(next: Page): void {
    if (!(next in PAGE_STATUS)) return
    page = next
    scheduleFlush()
  }
}
