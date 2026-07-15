import { create } from 'zustand'
import type {
  Account,
  AppSettings,
  DownloadTask,
  LaunchState,
  NotificationPayload,
  Page,
  Profile
} from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'

export interface Notification extends NotificationPayload {
  id: string
}

/** Startup gate: HWID validation → legal acceptance → app. */
export type BootPhase = 'loading' | 'hwid' | 'legal' | 'ready'

interface AppState {
  // Boot
  boot: BootPhase
  acceptLegal: () => Promise<void>

  // Navigation
  page: Page
  /** When set, the Profiles page shows this profile's detail view. */
  openProfileId: string | null
  /** When set, a mod details modal is open for this Modrinth project. */
  openProjectId: string | null
  /** Preview mode hides install controls (used while creating a profile). */
  openProjectPreview: boolean
  navigate: (page: Page) => void
  openProfile: (id: string | null) => void
  openProject: (id: string | null, preview?: boolean) => void

  // Data
  settings: AppSettings
  accounts: Account[]
  activeAccountId: string | null
  profiles: Profile[]
  selectedProfileId: string | null
  downloads: DownloadTask[]
  launch: LaunchState
  totalRamMb: number

  notifications: Notification[]
  pushNotification: (n: NotificationPayload) => void
  dismissNotification: (id: string) => void

  setSettings: (patch: Partial<AppSettings>) => Promise<void>
  selectProfile: (id: string) => Promise<void>
  refreshAccounts: () => Promise<void>
  refreshProfiles: () => Promise<void>

  init: () => Promise<void>
}

export const useApp = create<AppState>((set, get) => ({
  boot: 'loading',
  acceptLegal: async () => {
    await window.fvc.legal.accept()
    set({ boot: 'ready' })
  },

  page: 'home',
  openProfileId: null,
  openProjectId: null,
  openProjectPreview: false,
  navigate: (page) => set({ page, openProfileId: page === 'profiles' ? get().openProfileId : null }),
  openProfile: (id) => set({ openProfileId: id, page: 'profiles' }),
  openProject: (id, preview = false) => set({ openProjectId: id, openProjectPreview: preview }),

  settings: DEFAULT_SETTINGS,
  accounts: [],
  activeAccountId: null,
  profiles: [],
  selectedProfileId: null,
  downloads: [],
  launch: { profileId: null, phase: 'idle', detail: '', progress: -1 },
  totalRamMb: 8192,

  notifications: [],
  pushNotification: (n) => {
    const id = n.id ?? crypto.randomUUID()
    set((s) => ({ notifications: [...s.notifications.slice(-4), { ...n, id }] }))
    const duration = n.durationMs ?? (n.type === 'error' ? 8000 : 4500)
    setTimeout(() => get().dismissNotification(id), duration)
  },
  dismissNotification: (id) =>
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),

  setSettings: async (patch) => {
    // Optimistic update for snappy sliders/toggles.
    set((s) => ({ settings: { ...s.settings, ...patch } }))
    const saved = await window.fvc.settings.set(patch)
    set({ settings: saved })
  },

  selectProfile: async (id) => {
    set({ selectedProfileId: id })
    await window.fvc.profiles.setSelected(id)
  },

  refreshAccounts: async () => {
    const [accounts, activeAccountId] = await Promise.all([
      window.fvc.accounts.list(),
      window.fvc.accounts.getActive()
    ])
    set({ accounts, activeAccountId })
  },

  refreshProfiles: async () => {
    const [profiles, selectedProfileId] = await Promise.all([
      window.fvc.profiles.list(),
      window.fvc.profiles.getSelected()
    ])
    set({ profiles, selectedProfileId })
  },

  init: async () => {
    // Startup sequence: HWID validation gates everything else.
    const hwidStatus = await window.fvc.hwid.status()
    if (hwidStatus !== 'valid') {
      set({ boot: 'hwid' })
      return
    }

    const [settings, launch, downloads, totalRamMb, legal] = await Promise.all([
      window.fvc.settings.get(),
      window.fvc.launch.getState(),
      window.fvc.downloads.list(),
      window.fvc.system.totalRamMb(),
      window.fvc.legal.status()
    ])
    set({ settings, launch, downloads, totalRamMb })
    await Promise.all([get().refreshAccounts(), get().refreshProfiles()])

    window.fvc.onNotification((n) => get().pushNotification(n))
    window.fvc.onAccountsChanged(() => void get().refreshAccounts())
    window.fvc.onProfilesChanged(() => void get().refreshProfiles())
    window.fvc.launch.onState((launchState) => set({ launch: launchState }))
    window.fvc.downloads.onUpdate((tasks) => set({ downloads: tasks }))

    set({ boot: legal.accepted ? 'ready' : 'legal' })
  }
}))

/** Currently selected profile object (or null). */
export function useSelectedProfile(): Profile | null {
  return useApp((s) => s.profiles.find((p) => p.id === s.selectedProfileId) ?? null)
}

export function useActiveAccount(): Account | null {
  return useApp((s) => s.accounts.find((a) => a.id === s.activeAccountId) ?? null)
}

// ---- Formatting helpers used across pages ----

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(units.length - 1, Math.floor(Math.log2(bytes) / 10))
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export function formatPlayTime(seconds: number): string {
  if (seconds < 60) return 'Less than a minute'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours === 0) return `${minutes} min`
  return `${hours}h ${minutes}m`
}

export function formatRelative(iso: string | undefined): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

/** Convert #rrggbb to "r, g, b" for rgba() usage in CSS vars. */
export function hexToRgb(hex: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return '59, 203, 255'
  const num = parseInt(match[1], 16)
  return `${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}`
}
