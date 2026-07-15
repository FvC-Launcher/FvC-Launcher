import { safeStorage } from 'electron'
import { createHash, randomUUID } from 'crypto'
import { Auth, tokenUtils, type Minecraft } from 'msmc'
import { JsonStore } from '../store'
import { paths } from '../paths'
import { broadcast, notify } from '../broadcast'
import { CH } from '@shared/ipc'
import type { Account } from '@shared/types'

interface StoredAccount extends Account {
  /** base64 of safeStorage-encrypted msmc MCToken JSON (microsoft only) */
  encryptedToken?: string
}

interface AccountsFile {
  accounts: StoredAccount[]
  activeId: string | null
}

let store: JsonStore<AccountsFile> | null = null

function getStore(): JsonStore<AccountsFile> {
  if (!store) {
    store = new JsonStore<AccountsFile>(paths.file('accounts.json'), {
      accounts: [],
      activeId: null
    })
  }
  return store
}

function toPublic(a: StoredAccount): Account {
  const { encryptedToken: _encryptedToken, ...pub } = a
  return pub
}

function save(file: AccountsFile): void {
  getStore().set(file)
  broadcast(CH.accountsChanged)
}

function encryptToken(tokenJson: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(tokenJson).toString('base64')
  }
  // Fallback (e.g. some Linux setups without a keyring): store obfuscated.
  return 'plain:' + Buffer.from(tokenJson, 'utf-8').toString('base64')
}

function decryptToken(stored: string): string {
  if (stored.startsWith('plain:')) {
    return Buffer.from(stored.slice(6), 'base64').toString('utf-8')
  }
  return safeStorage.decryptString(Buffer.from(stored, 'base64'))
}

/** Deterministic offline UUID, matching vanilla's OfflinePlayer scheme. */
function offlineUuid(username: string): string {
  const hash = createHash('md5').update(`OfflinePlayer:${username}`).digest()
  hash[6] = (hash[6] & 0x0f) | 0x30 // version 3
  hash[8] = (hash[8] & 0x3f) | 0x80
  const hex = hash.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function mcAccountFromMsmc(mc: Minecraft, existingId?: string): StoredAccount {
  const token = mc.getToken(true)
  return {
    id: existingId ?? randomUUID(),
    type: 'microsoft',
    username: mc.profile?.name ?? 'Unknown',
    uuid: mc.profile?.id ?? '',
    expiresAt: new Date(mc.exp).toISOString(),
    needsRelogin: false,
    addedAt: new Date().toISOString(),
    encryptedToken: encryptToken(JSON.stringify(token))
  }
}

export const accountsService = {
  list(): Account[] {
    return getStore().get().accounts.map(toPublic)
  },

  getActiveId(): string | null {
    const file = getStore().get()
    if (file.activeId && file.accounts.some((a) => a.id === file.activeId)) return file.activeId
    return file.accounts[0]?.id ?? null
  },

  setActive(id: string): void {
    const file = { ...getStore().get(), activeId: id }
    save(file)
  },

  addOffline(username: string): Account {
    const trimmed = username.trim()
    if (!/^[A-Za-z0-9_]{3,16}$/.test(trimmed)) {
      throw new Error('Usernames must be 3-16 characters (letters, numbers, underscore).')
    }
    const file = getStore().get()
    const account: StoredAccount = {
      id: randomUUID(),
      type: 'offline',
      username: trimmed,
      uuid: offlineUuid(trimmed),
      addedAt: new Date().toISOString()
    }
    save({
      accounts: [...file.accounts, account],
      activeId: file.activeId ?? account.id
    })
    return toPublic(account)
  },

  async loginMicrosoft(): Promise<Account> {
    const auth = new Auth('select_account')
    const xbox = await auth.launch('electron', {
      title: 'Sign in to Microsoft - FvC Launcher',
      backgroundColor: '#0F1115',
      width: 480,
      height: 640
    })
    const mc = await xbox.getMinecraft()
    if (!mc.profile?.id) {
      throw new Error('This Microsoft account does not own Minecraft: Java Edition.')
    }

    const file = getStore().get()
    const existing = file.accounts.find((a) => a.type === 'microsoft' && a.uuid === mc.profile!.id)
    const account = mcAccountFromMsmc(mc, existing?.id)

    const accounts = existing
      ? file.accounts.map((a) => (a.id === existing.id ? account : a))
      : [...file.accounts, account]
    save({ accounts, activeId: file.activeId ?? account.id })
    return toPublic(account)
  },

  async refresh(id: string): Promise<Account> {
    const file = getStore().get()
    const stored = file.accounts.find((a) => a.id === id)
    if (!stored) throw new Error('Account not found.')
    if (stored.type === 'offline') return toPublic(stored)
    if (!stored.encryptedToken) throw new Error('No stored session. Please sign in again.')

    try {
      const auth = new Auth('select_account')
      const token = JSON.parse(decryptToken(stored.encryptedToken))
      const mc = await tokenUtils.fromToken(auth, token, true)
      const updated = mcAccountFromMsmc(mc, stored.id)
      updated.addedAt = stored.addedAt
      save({
        ...file,
        accounts: file.accounts.map((a) => (a.id === id ? updated : a))
      })
      return toPublic(updated)
    } catch (err) {
      const updated: StoredAccount = { ...stored, needsRelogin: true }
      save({
        ...file,
        accounts: file.accounts.map((a) => (a.id === id ? updated : a))
      })
      notify({
        type: 'warning',
        title: 'Session expired',
        body: `Please sign in again with ${stored.username}.`
      })
      throw err instanceof Error ? err : new Error(String(err))
    }
  },

  /**
   * Returns an MCLC-compatible authorization object for launching.
   * Microsoft sessions are refreshed transparently when close to expiry.
   */
  async getLaunchAuth(id: string): Promise<Record<string, unknown>> {
    const file = getStore().get()
    const stored = file.accounts.find((a) => a.id === id)
    if (!stored) throw new Error('No account selected. Add an account first.')

    if (stored.type === 'offline') {
      return {
        access_token: 'offline',
        client_token: 'offline',
        uuid: stored.uuid,
        name: stored.username,
        user_properties: '{}',
        meta: { type: 'mojang', demo: false }
      }
    }

    if (!stored.encryptedToken) throw new Error('Session missing. Please sign in again.')
    const auth = new Auth('select_account')
    const token = JSON.parse(decryptToken(stored.encryptedToken))
    const mc = await tokenUtils.fromToken(auth, token, true)

    // Persist rotated refresh token.
    const updated = mcAccountFromMsmc(mc, stored.id)
    updated.addedAt = stored.addedAt
    save({ ...file, accounts: file.accounts.map((a) => (a.id === stored.id ? updated : a)) })

    return mc.mclc(true) as unknown as Record<string, unknown>
  },

  remove(id: string): void {
    const file = getStore().get()
    const accounts = file.accounts.filter((a) => a.id !== id)
    save({
      accounts,
      activeId: file.activeId === id ? (accounts[0]?.id ?? null) : file.activeId
    })
  },

  /**
   * Startup: quietly refresh Microsoft sessions so users stay signed in.
   * Failures mark the account as needing re-login; nothing blocks the UI.
   */
  refreshAllInBackground(): void {
    for (const account of getStore().get().accounts) {
      if (account.type === 'microsoft' && !account.needsRelogin) {
        void this.refresh(account.id).catch(() => {
          /* handled inside refresh(): flags needsRelogin + notifies */
        })
      }
    }
  }
}
