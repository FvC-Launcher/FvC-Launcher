import { BrowserWindow, app, ipcMain, net } from 'electron'
import { autoUpdater, type ProgressInfo } from 'electron-updater'
import { join } from 'path'
import { CH } from '@shared/ipc'
import type { SplashState } from '@shared/types'
import { settingsService } from './services/settings'
import { configureChannel } from './services/updater'

/**
 * Startup update window (Windows, packaged builds), like Discord's: before
 * the launcher opens, a small window checks GitHub Releases, downloads a new
 * version and installs it silently. The NSIS installer then relaunches the
 * launcher with --updated. With nothing newer it hands off to the main
 * window; offline or on errors it offers Retry / Continue.
 *
 * Settings → Updates → "Update before opening" turns it off, which brings
 * back the consent popup (services/updater.ts).
 */

/**
 * - 'checked': nothing newer — open the launcher, no background check needed
 * - 'skipped': opening without a completed check (Continue, or just updated)
 * - 'quit': an update is installing, or the window was closed
 */
export type SplashOutcome = 'checked' | 'skipped' | 'quit'

/** A hung check (captive portal, dead DNS) shouldn't hold the launcher hostage. */
const CHECK_TIMEOUT_MS = 15_000
/** If the installer hasn't taken over by then, it never will. */
const INSTALL_TIMEOUT_MS = 30_000

const OFFLINE_ERROR =
  /ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_NETWORK_CHANGED|ERR_ADDRESS_UNREACHABLE|ERR_CONNECTION_(REFUSED|RESET|CLOSED|TIMED_OUT)|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNREFUSED|ECONNRESET/

const OFFLINE: SplashState = {
  phase: 'failed',
  status: 'No internet connection',
  detail: 'Retry, or continue without updating.'
}

let win: BrowserWindow | null = null
/** The user closed the window: the app is quitting, stop before installing. */
let closed = false
let state: SplashState = { phase: 'checking', status: 'Checking for updates…' }

function setState(next: SplashState): void {
  state = next
  if (win && !win.isDestroyed()) win.webContents.send(CH.splashState, state)
}

function createWindow(): BrowserWindow {
  const s = settingsService.get()
  const w = new BrowserWindow({
    width: 300,
    height: 340,
    show: false,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    center: true,
    backgroundColor: '#0F1115',
    title: 'FvC Launcher',
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/splash.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  w.once('ready-to-show', () => w.show())

  // The page themes itself from these before its first paint.
  const query = { theme: s.theme, accent: s.accentColor, accent2: s.accentColor2 }
  if (process.env['ELECTRON_RENDERER_URL']) {
    void w.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/splash.html?${new URLSearchParams(query)}`)
  } else {
    void w.loadFile(join(__dirname, '../renderer/splash.html'), { query })
  }
  return w
}

function firstLine(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  // electron-updater errors embed whole HTTP responses.
  return (raw.split('\n')[0] ?? raw).slice(0, 200)
}

function failed(status: string, err: unknown): SplashState {
  const raw = err instanceof Error ? err.message : String(err)
  if (!net.isOnline() || OFFLINE_ERROR.test(raw)) return OFFLINE
  return { phase: 'failed', status, detail: firstLine(err) }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}

/**
 * One pass: check → download → install. Resolves 'none' when nothing is
 * newer, or the failure to show. While installing it never resolves unless
 * the installer fails to start — the app quits instead.
 */
async function attempt(): Promise<'none' | SplashState> {
  setState({ phase: 'checking', status: 'Checking for updates…' })
  if (!net.isOnline()) return OFFLINE

  configureChannel()
  autoUpdater.autoDownload = false

  let version: string
  try {
    const result = await withTimeout(
      autoUpdater.checkForUpdates(),
      CHECK_TIMEOUT_MS,
      "The update server didn't respond."
    )
    if (!result?.isUpdateAvailable) return 'none'
    version = result.updateInfo.version
  } catch (err) {
    return failed("Couldn't check for updates", err)
  }

  setState({ phase: 'downloading', status: 'Downloading update…', detail: `v${version}` })
  const onProgress = (p: ProgressInfo): void =>
    setState({
      phase: 'downloading',
      status: 'Downloading update…',
      detail: `v${version} · ${Math.round(p.percent)}%`,
      percent: p.percent
    })
  autoUpdater.on('download-progress', onProgress)
  try {
    await autoUpdater.downloadUpdate()
  } catch (err) {
    return failed("Couldn't download the update", err)
  } finally {
    autoUpdater.off('download-progress', onProgress)
  }

  setState({ phase: 'installing', status: 'Installing update…', detail: `v${version} · the launcher will restart` })
  // Let "Installing" register before the window disappears.
  await new Promise((r) => setTimeout(r, 800))
  if (closed) return 'none'

  // install() reports a failure to start through the error event (sometimes
  // synchronously), not a return value — listen before calling it.
  const installError = new Promise<unknown>((resolve) => {
    autoUpdater.once('error', resolve)
    setTimeout(() => resolve(new Error("The installer didn't start.")), INSTALL_TIMEOUT_MS)
  })
  // Silent (/S --updated) into the same folder, then relaunch.
  autoUpdater.quitAndInstall(true, true)
  return failed("Couldn't install the update", await installError)
}

function waitForChoice(): Promise<'retry' | 'skip'> {
  return new Promise((resolve) => {
    const done = (choice: 'retry' | 'skip') => (): void => {
      ipcMain.removeAllListeners(CH.splashRetry)
      ipcMain.removeAllListeners(CH.splashSkip)
      resolve(choice)
    }
    ipcMain.once(CH.splashRetry, done('retry'))
    ipcMain.once(CH.splashSkip, done('skip'))
  })
}

async function flow(): Promise<SplashOutcome> {
  // The installer relaunches us with --updated after a silent update.
  if (process.argv.includes('--updated')) {
    setState({ phase: 'launching', status: 'Launching…', detail: `Updated to v${app.getVersion()}` })
    // Long enough to read before the main window covers it.
    await new Promise((r) => setTimeout(r, 1200))
    return 'skipped'
  }
  for (;;) {
    const result = await attempt()
    if (result === 'none') {
      setState({ phase: 'launching', status: 'Launching…' })
      return 'checked'
    }
    setState(result)
    if ((await waitForChoice()) === 'skip') {
      setState({ phase: 'launching', status: 'Launching…' })
      return 'skipped'
    }
  }
}

export const splash = {
  shouldShow(): boolean {
    const s = settingsService.get()
    return process.platform === 'win32' && app.isPackaged && s.checkLauncherUpdates && s.updateOnStartup
  },

  /** Show the window and run the update flow; resolves when the launcher may open. */
  async run(): Promise<SplashOutcome> {
    ipcMain.handle(CH.splashGetState, () => state)
    const w = (win = createWindow())
    const whenClosed = new Promise<'quit'>((resolve) =>
      w.once('closed', () => {
        closed = true
        resolve('quit')
      })
    )
    try {
      return await Promise.race([flow(), whenClosed])
    } finally {
      ipcMain.removeHandler(CH.splashGetState)
      ipcMain.removeAllListeners(CH.splashRetry)
      ipcMain.removeAllListeners(CH.splashSkip)
    }
  },

  /** Keep "Launching…" up until the main window is on screen, then close. */
  closeWhenShown(main: BrowserWindow): void {
    const w = win
    win = null
    if (!w || w.isDestroyed()) return
    const close = (): void => {
      if (!w.isDestroyed()) w.destroy()
    }
    if (main.isVisible()) close()
    else main.once('show', close)
  }
}
