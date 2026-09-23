import { JsonStore } from '../store'
import { paths } from '../paths'
import { broadcast } from '../broadcast'
import { CH } from '@shared/ipc'
import type { AccountStats } from '@shared/types'

/**
 * Per-account play statistics. Kept in their own file rather than on the
 * account record, because the account record is rebuilt from scratch every
 * time a Microsoft session refreshes.
 */

interface StatsFile {
  accounts: Record<string, AccountStats>
}

let store: JsonStore<StatsFile> | null = null

function getStore(): JsonStore<StatsFile> {
  if (!store) {
    store = new JsonStore<StatsFile>(paths.file('account-stats.json'), { accounts: {} })
  }
  return store
}

function empty(): AccountStats {
  return { launches: 0, playTimeSeconds: 0, longestSessionSeconds: 0, profiles: {} }
}

function edit(accountId: string, change: (stats: AccountStats) => void): void {
  const file = getStore().get()
  const current = file.accounts[accountId] ?? empty()
  const stats: AccountStats = { ...current, profiles: { ...current.profiles } }
  change(stats)
  getStore().set({ accounts: { ...file.accounts, [accountId]: stats } })
  broadcast(CH.accountStatsChanged)
}

export const accountStatsService = {
  all(): Record<string, AccountStats> {
    return getStore().get().accounts
  },

  /** The game window came up for this account. */
  recordLaunch(accountId: string, profileId: string): void {
    edit(accountId, (stats) => {
      const now = new Date().toISOString()
      const perProfile = stats.profiles[profileId] ?? { seconds: 0, launches: 0 }
      stats.launches += 1
      stats.firstPlayed ??= now
      stats.lastPlayed = now
      stats.lastProfileId = profileId
      stats.profiles[profileId] = { ...perProfile, launches: perProfile.launches + 1 }
    })
  },

  /** The game closed after running for `seconds`. */
  recordSession(accountId: string, profileId: string, seconds: number): void {
    const played = Math.max(0, Math.round(seconds))
    edit(accountId, (stats) => {
      const perProfile = stats.profiles[profileId] ?? { seconds: 0, launches: 0 }
      stats.playTimeSeconds += played
      stats.longestSessionSeconds = Math.max(stats.longestSessionSeconds, played)
      stats.lastPlayed = new Date().toISOString()
      stats.profiles[profileId] = { ...perProfile, seconds: perProfile.seconds + played }
    })
  },

  forget(accountId: string): void {
    const { [accountId]: _removed, ...rest } = getStore().get().accounts
    getStore().set({ accounts: rest })
    broadcast(CH.accountStatsChanged)
  }
}
