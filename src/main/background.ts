import { Menu, Tray, app, nativeImage, type NativeImage } from 'electron'
import { execFile } from 'child_process'
import { join } from 'path'
import { settingsService } from './services/settings'
import { discordService } from './services/discord'

/**
 * "Keep running in the background" (Settings → General, on by default).
 *
 * Closing the launcher window — title bar X, Alt+F4, the taskbar's "Close
 * window" — doesn't quit. The window is destroyed, and with it the renderer
 * process, while a tray icon stays to bring it back. Games, downloads and
 * Discord presence live in the main process and carry on. Turned off,
 * closing the window quits as before.
 */

/** Let the renderer exit and the GPU process drop its surfaces first. */
const TRIM_DELAY_MS = 3000

let tray: Tray | null = null
/** Opens (or focuses) the launcher window; set once it first opened. */
let open: (() => void) | null = null
let trimTimer: NodeJS.Timeout | null = null

/**
 * Windows: move the launcher's idle memory out of RAM, like Discord does in
 * the tray. Without this the GPU process alone keeps ~200 MB resident with
 * nothing to draw; after it, the whole launcher sits at a few MB (measured
 * 391 MB → 11 MB) and pages come back on demand. Shrinking .NET's
 * Process.MaxWorkingSet calls SetProcessWorkingSetSize, which trims right
 * away; the old limit is restored so nothing stays capped. No native module.
 */
function trimMemory(): void {
  if (process.platform !== 'win32') return
  const pids = app.getAppMetrics().map((m) => m.pid)
  const script =
    `foreach ($id in ${pids.join(',')}) { try { ` +
    `$p = [Diagnostics.Process]::GetProcessById($id); $max = $p.MaxWorkingSet; ` +
    `$p.MaxWorkingSet = $p.MinWorkingSet; $p.MaxWorkingSet = $max } catch {} }`
  const powershell = join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32\\WindowsPowerShell\\v1.0\\powershell.exe')
  execFile(powershell, ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true }, (err) => {
    if (err) console.error('[background] memory trim failed:', err.message)
  })
}

function trayIcon(): NativeImage {
  const src = nativeImage.createFromPath(join(__dirname, '../../resources/icon.png'))
  // The 500px artwork has transparent padding; crop it so the tray icon fills its slot.
  const art = src.crop({ x: 45, y: 45, width: 410, height: 410 })
  const size = (px: number): NativeImage => art.resize({ width: px, height: px, quality: 'best' })
  // Linux trays are ~22–24px and scale down themselves.
  if (process.platform !== 'win32') return size(32)
  const icon = size(16)
  icon.addRepresentation({ scaleFactor: 2, dataURL: size(32).toDataURL() })
  return icon
}

function createTray(): void {
  if (tray) return
  tray = new Tray(trayIcon())
  tray.setToolTip('FvC Launcher')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open FvC Launcher', click: () => open?.() },
      { type: 'separator' },
      { label: 'Quit FvC Launcher', click: () => app.quit() }
    ])
  )
  // Windows: left click opens the launcher, right click shows the menu.
  tray.on('click', () => open?.())
}

function destroyTray(): void {
  tray?.destroy()
  tray = null
}

export const background = {
  /**
   * Call once the launcher window exists. Until then (the startup update
   * window), closing a window still quits.
   */
  init(openWindow: () => void): void {
    open = openWindow
    background.refresh()
  },

  /** Re-read the setting: show the tray icon while it's on. */
  refresh(): void {
    if (open && settingsService.get().runInBackground) createTray()
    else destroyTray()
  },

  /** Every window closed: stay in the tray, or quit. */
  windowsClosed(): void {
    if (!open || !settingsService.get().runInBackground) {
      app.quit()
      return
    }
    discordService.setBackground(true)
    trimTimer = setTimeout(() => {
      trimTimer = null
      trimMemory()
    }, TRIM_DELAY_MS)
  },

  /** The launcher window is open again. */
  windowOpened(): void {
    if (trimTimer) clearTimeout(trimTimer)
    trimTimer = null
    discordService.setBackground(false)
  }
}
