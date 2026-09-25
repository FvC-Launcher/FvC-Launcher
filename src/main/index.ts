import { BrowserWindow, app, net, protocol, shell } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { JsonStore } from './store'
import { ensureDirs, paths } from './paths'
import { registerIpc } from './ipc'
import { broadcast } from './broadcast'
import { accountsService } from './services/accounts'
import { updaterService } from './services/updater'
import { discordService } from './services/discord'
import { splash } from './splash'
import { background } from './background'
import { CH } from '@shared/ipc'

interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  maximized: boolean
}

let windowStore: JsonStore<WindowState>
/** The launcher window; null while running in the background. */
let mainWindow: BrowserWindow | null = null
/** Past the startup update window; the launcher window has opened once. */
let started = false

// Render natively on Wayland instead of falling back to XWayland, which
// upscales a lower-res X11 buffer and looks blurry under fractional scaling
// (e.g. Hyprland). Must be set before the app is ready.
if (process.platform === 'linux' && (process.env['XDG_SESSION_TYPE'] === 'wayland' || process.env['WAYLAND_DISPLAY'])) {
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto')
  app.commandLine.appendSwitch('enable-features', 'WaylandWindowDecorations')
}

// Serve user-picked local images (profile/app backgrounds) to the renderer.
protocol.registerSchemesAsPrivileged([
  { scheme: 'fvc-file', privileges: { standard: true, secure: true, stream: true } }
])

function createWindow(): BrowserWindow {
  const state = windowStore.get()

  const win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 1280,
    minHeight: 720,
    show: false,
    frame: false,
    backgroundColor: '#0F1115',
    title: 'FvC Launcher',
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow = win
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })
  background.windowOpened()

  if (state.maximized) win.maximize()
  win.once('ready-to-show', () => win.show())

  const persistBounds = (): void => {
    if (win.isDestroyed()) return
    const maximized = win.isMaximized()
    const bounds = win.getNormalBounds()
    windowStore.set({
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      maximized
    })
  }
  win.on('resized', persistBounds)
  win.on('moved', persistBounds)
  win.on('close', persistBounds)
  win.on('maximize', () => {
    persistBounds()
    broadcast(CH.winMaximizedChanged, true)
  })
  win.on('unmaximize', () => {
    persistBounds()
    broadcast(CH.winMaximizedChanged, false)
  })

  // If the renderer crashes (GPU reset, driver hiccup, OOM), reload instead
  // of leaving a dead black window behind.
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[main] renderer gone:', details.reason)
    if (details.reason !== 'clean-exit' && !win.isDestroyed()) {
      win.webContents.reload()
    }
  })
  win.webContents.on('unresponsive', () => {
    console.error('[main] renderer unresponsive')
  })

  // External links open in the system browser, never inside the launcher.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

/** Bring the launcher window forward, re-creating it if it's in the background. */
function showWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // Launching it again also brings it back from the background.
    if (started) {
      showWindow()
      return
    }
    // Still in the startup update window.
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  void app.whenReady().then(async () => {
    ensureDirs()
    windowStore = new JsonStore<WindowState>(paths.file('window-state.json'), {
      width: 1600,
      height: 900,
      maximized: false
    })

    protocol.handle('fvc-file', (request) => {
      const filePath = decodeURIComponent(new URL(request.url).pathname)
      return net.fetch(pathToFileURL(filePath).toString())
    })

    registerIpc()

    // Windows: check for and install launcher updates before opening.
    let checkedForUpdates = false
    if (splash.shouldShow()) {
      const outcome = await splash.run()
      if (outcome === 'quit') return
      checkedForUpdates = outcome === 'checked'
    }

    splash.closeWhenShown(createWindow())
    started = true
    // Closing the window from now on sends the launcher to the tray.
    background.init(showWindow)

    // Keep Microsoft sessions fresh without blocking startup.
    setTimeout(() => accountsService.refreshAllInBackground(), 2500)
    // Check GitHub Releases for launcher updates (packaged builds only).
    updaterService.init({ alreadyChecked: checkedForUpdates })
    // Show what the player is doing on their Discord profile.
    discordService.init()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

// Quit, or keep running in the tray (Settings → General). Not emitted when
// quitting via app.quit() (tray menu, updates), so those always exit.
app.on('window-all-closed', () => background.windowsClosed())
