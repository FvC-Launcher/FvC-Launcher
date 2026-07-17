import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import { broadcast, notify } from '../broadcast'
import { CH } from '@shared/ipc'
import { settingsService } from './settings'
import type { UpdaterState } from '@shared/types'

/**
 * GitHub-Releases auto updates (electron-updater).
 *
 * Consent-first flow — nothing is downloaded or installed silently:
 *   check → 'available' → renderer popup → user clicks Download →
 *   'downloading' (progress) → 'downloaded' → user picks Restart now /
 *   on next quit.
 *
 * The publish target (owner/repo) comes from electron-builder.yml and is
 * baked into the packaged app as app-update.yml.
 */

let state: UpdaterState = { status: 'idle' }
let initialized = false
/** Distinguishes user-triggered checks (verbose) from background ones (quiet). */
let manualCheck = false

function setState(next: UpdaterState): void {
  state = next
  broadcast(CH.updaterState, state)
}

/**
 * The GitHub provider hands release notes over as HTML (converted from the
 * release body). The renderer escapes HTML for safety, so convert the common
 * tags back to markdown-ish text before showing them.
 */
function htmlToMarkdown(html: string): string {
  if (!/<[a-z][^>]*>/i.test(html)) return html // already plain text/markdown
  return (
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>\s*<p>/gi, '\n\n')
      .replace(/<\/?p[^>]*>/gi, '\n')
      .replace(/<h([1-6])[^>]*>/gi, (_m, n: string) => '\n' + '#'.repeat(Number(n)) + ' ')
      .replace(/<\/h[1-6]>/gi, '\n')
      .replace(/<li[^>]*>/gi, '- ')
      .replace(/<\/li>/gi, '\n')
      .replace(/<\/?(ul|ol)[^>]*>/gi, '\n')
      .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
      .replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, '**$2**')
      .replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, '*$2*')
      .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
      .replace(/<[^>]+>/g, '') // strip anything else
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}

function releaseNotesToString(notes: unknown): string | undefined {
  if (typeof notes === 'string') return htmlToMarkdown(notes)
  if (Array.isArray(notes)) {
    return notes
      .map((n) =>
        typeof n === 'string'
          ? htmlToMarkdown(n)
          : `## ${n.version}\n\n${htmlToMarkdown(String(n.note ?? ''))}`
      )
      .join('\n\n')
  }
  return undefined
}

function wireEvents(): void {
  autoUpdater.autoDownload = false // never download without consent
  autoUpdater.autoInstallOnAppQuit = true // downloaded updates apply on quit
  autoUpdater.allowPrerelease = false

  autoUpdater.on('checking-for-update', () => setState({ status: 'checking' }))

  autoUpdater.on('update-available', (info) => {
    setState({
      status: 'available',
      version: info.version,
      notes: releaseNotesToString(info.releaseNotes)
    })
  })

  autoUpdater.on('update-not-available', () => {
    setState({ status: 'idle' })
    if (manualCheck) {
      notify({ type: 'success', title: 'Up to date', body: `FvC Launcher ${app.getVersion()} is the latest version.` })
    }
    manualCheck = false
  })

  autoUpdater.on('download-progress', (progress) => {
    setState({
      status: 'downloading',
      version: state.version,
      notes: state.notes,
      percent: progress.percent,
      speedBps: progress.bytesPerSecond
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    setState({ status: 'downloaded', version: info.version, notes: state.notes })
  })

  autoUpdater.on('error', (err) => {
    const raw = err instanceof Error ? err.message : String(err)
    // electron-updater errors embed whole HTTP responses — keep the first
    // meaningful line so notifications stay readable.
    const message = (raw.split('\n')[0] ?? raw).slice(0, 200)
    setState({ status: 'error', error: message })
    if (manualCheck) {
      notify({ type: 'error', title: 'Update check failed', body: message })
    }
    manualCheck = false
    console.error('[updater]', raw)
  })
}

export const updaterService = {
  getState(): UpdaterState {
    return state
  },

  /** Wire events and run the startup check (packaged builds only). */
  init(): void {
    if (initialized) return
    initialized = true

    if (!app.isPackaged) {
      // Dev builds have no app-update.yml and should never self-update.
      setState({ status: 'dev' })
      return
    }
    wireEvents()

    if (settingsService.get().checkLauncherUpdates) {
      // Give startup (HWID gate, window paint) a moment before checking.
      setTimeout(() => {
        void autoUpdater.checkForUpdates().catch(() => {
          /* offline etc. — state already set by the error event */
        })
      }, 6000)
    }
  },

  async check(): Promise<void> {
    if (!app.isPackaged) {
      setState({ status: 'dev' })
      notify({
        type: 'info',
        title: 'Development build',
        body: 'Auto-update only works in packaged builds (installed from a release).'
      })
      return
    }
    if (state.status === 'downloading' || state.status === 'downloaded') return
    manualCheck = true
    await autoUpdater.checkForUpdates().catch(() => {
      /* error event handles state + notification */
    })
  },

  async download(): Promise<void> {
    if (!app.isPackaged || state.status !== 'available') return
    setState({ ...state, status: 'downloading', percent: 0 })
    await autoUpdater.downloadUpdate().catch(() => {
      /* error event handles state */
    })
  },

  install(): void {
    if (state.status !== 'downloaded') return
    // isSilent=false shows the platform installer UI, forceRunAfter=true
    // relaunches the app when it finishes.
    autoUpdater.quitAndInstall(false, true)
  }
}
