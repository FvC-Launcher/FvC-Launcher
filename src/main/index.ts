import { BrowserWindow, app, net, protocol, shell } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { JsonStore } from './store'
import { ensureDirs, paths } from './paths'
import { registerIpc } from './ipc'
import { broadcast } from './broadcast'
import { hwidService } from './services/hwid'
import { accountsService } from './services/accounts'
import { updaterService } from './services/updater'
import { CH } from '@shared/ipc'

interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  maximized: boolean
}

let windowStore: JsonStore<WindowState>

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

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
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

    // Startup sequence: HWID validation runs before the UI becomes usable
    // (the renderer boot gate asks for this status first). Kick it off now.
    const hwidStatus = await hwidService.status()
    createWindow()

    if (hwidStatus === 'valid') {
      // Keep Microsoft sessions fresh without blocking startup.
      setTimeout(() => accountsService.refreshAllInBackground(), 2500)
      // Check GitHub Releases for launcher updates (packaged builds only).
      updaterService.init()
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  app.quit()
})
