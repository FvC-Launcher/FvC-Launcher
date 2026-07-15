import { app } from 'electron'
import { JsonStore } from '../store'
import { paths } from '../paths'
import { DEFAULT_SETTINGS, type AppSettings } from '@shared/types'

let store: JsonStore<AppSettings> | null = null

function getStore(): JsonStore<AppSettings> {
  if (!store) store = new JsonStore<AppSettings>(paths.file('settings.json'), DEFAULT_SETTINGS)
  return store
}

export const settingsService = {
  get(): AppSettings {
    return getStore().get()
  },

  set(patch: Partial<AppSettings>): AppSettings {
    const next = getStore().patch(patch)
    if ('launchOnStartup' in patch) {
      applyLoginItem(next.launchOnStartup)
    }
    return next
  },

  reset(): AppSettings {
    getStore().set(structuredClone(DEFAULT_SETTINGS))
    applyLoginItem(false)
    return getStore().get()
  }
}

function applyLoginItem(enabled: boolean): void {
  // Login items are supported on Windows out of the box; on Linux, Electron
  // handles this only for AppImage-like setups, so guard with a try.
  try {
    app.setLoginItemSettings({ openAtLogin: enabled })
  } catch (err) {
    console.error('[settings] setLoginItemSettings failed:', err)
  }
}
