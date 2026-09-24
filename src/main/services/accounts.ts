import { safeStorage } from 'electron'
import { createHash, randomUUID } from 'crypto'
import { Auth, Minecraft, lexicon } from 'msmc'
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

/**
 * msmc rejects with plain objects, not Errors: `{ response, ts }` when an HTTP
 * step fails (ts names the step), or lexicon `{ name, message }` objects.
 * Convert them so the real reason survives IPC instead of "[object Object]".
 */
function asError(err: unknown): Error {
  if (err instanceof Error) return err
  const failed = httpFailure(err)
  if (failed) {
    return new Error(`${lexicon.getCode(failed.ts as never)}${failed.status ? ` (HTTP ${failed.status})` : ''}`)
  }
  if (err && typeof err === 'object') {
    const o = err as { name?: unknown; message?: unknown; error?: unknown; reason?: unknown }
    const parts = [o.name, o.message ?? o.error ?? o.reason].filter(
      (p): p is string => typeof p === 'string' && p.length > 0
    )
    if (parts.length > 0) return new Error(parts.join(': '))
    try {
      return new Error(JSON.stringify(err))
    } catch {
      /* circular — fall through */
    }
  }
  return new Error(String(err))
}

/** Deterministic offline UUID, matching vanilla's OfflinePlayer scheme. */
function offlineUuid(username: string): string {
  const hash = createHash('md5').update(`OfflinePlayer:${username}`).digest()
  hash[6] = (hash[6] & 0x0f) | 0x30 // version 3
  hash[8] = (hash[8] & 0x3f) | 0x80
  const hex = hash.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** What we persist per Microsoft account (msmc's MCToken, JSON-encoded and encrypted). */
interface StoredToken {
  refresh: string
  mcToken: string
  profile: { id: string; name: string } & Record<string, unknown>
  xuid?: string
  exp: number
}

/** `mc.getToken(true)`, keeping the old refresh token if Microsoft didn't rotate it. */
function tokenOf(mc: Minecraft, previousRefresh?: string): StoredToken {
  const token = mc.getToken(true) as unknown as StoredToken
  return { ...token, refresh: token.refresh || previousRefresh || '' }
}

function mcAccountFromMsmc(mc: Minecraft, existingId?: string): StoredAccount {
  return {
    id: existingId ?? randomUUID(),
    type: 'microsoft',
    username: mc.profile?.name ?? 'Unknown',
    uuid: mc.profile?.id ?? '',
    expiresAt: new Date(mc.exp).toISOString(),
    needsRelogin: false,
    addedAt: new Date().toISOString(),
    encryptedToken: encryptToken(JSON.stringify(tokenOf(mc)))
  }
}

// ------------------------------------------------------------------ sessions
//
// We restore sessions ourselves instead of msmc's tokenUtils.fromToken, which
// (in msmc 5.0.5) only refreshes tokens that are still valid: once the stored
// Minecraft token expired it returned the dead token as-is, the account kept
// looking signed in, and every launch failed to authenticate until the account
// was removed and re-added. It could also hang forever when a refresh failed.

const HOUR = 3_600_000
/** Launches get a token with at least this long left, so servers joined hours later still accept it. */
const LAUNCH_VALIDITY_MS = 12 * HOUR
/** Enough for a single API call such as changing the skin. */
const API_VALIDITY_MS = 5 * 60_000

/** One refresh per account at a time; concurrent callers share it instead of racing on the refresh token. */
const inflight = new Map<string, Promise<Minecraft>>()

/** Thrown when Microsoft rejected the session for good: only signing in again fixes it. */
class SessionEndedError extends Error {}

function httpFailure(err: unknown): { ts: string; status: number } | null {
  if (!err || typeof err !== 'object' || !('ts' in err)) return null
  const e = err as { ts?: unknown; response?: { status?: unknown } }
  if (typeof e.ts !== 'string') return null
  return { ts: e.ts, status: typeof e.response?.status === 'number' ? e.response.status : 0 }
}

/**
 * A client error from Microsoft, Xbox Live or Mojang (bad or revoked refresh
 * token, account problem) means the session is gone. Network errors, timeouts,
 * rate limits (429) and server errors are temporary and must not sign anyone out.
 */
function sessionEnded(err: unknown): boolean {
  const failed = httpFailure(err)
  if (!failed) return false
  const { status } = failed
  return status >= 400 && status < 500 && status !== 408 && status !== 429
}

function readToken(stored: StoredAccount): StoredToken {
  if (!stored.encryptedToken) throw new SessionEndedError('No saved session.')
  try {
    const token = JSON.parse(decryptToken(stored.encryptedToken)) as StoredToken
    if (!token.refresh || !token.mcToken) throw new Error('incomplete')
    return token
  } catch {
    // Unreadable (e.g. the OS keyring changed): nothing to refresh with.
    throw new SessionEndedError('The saved session could not be read.')
  }
}

function sessionFromToken(token: StoredToken): Minecraft {
  return new Minecraft(token.mcToken, token.profile as never, new Auth('select_account'), token.refresh, token.exp)
}

function findStored(id: string): StoredAccount {
  const stored = getStore().get().accounts.find((a) => a.id === id)
  if (!stored) throw new Error('Account not found.')
  return stored
}

/** Re-reads the store at write time so concurrent updates to other fields and accounts aren't lost. */
function updateStored(id: string, patch: (a: StoredAccount) => StoredAccount): void {
  const file = getStore().get()
  save({ ...file, accounts: file.accounts.map((a) => (a.id === id ? patch(a) : a)) })
}

function persistSession(id: string, mc: Minecraft, previousRefresh: string): void {
  updateStored(id, (a) => ({
    ...a,
    username: mc.profile?.name ?? a.username,
    uuid: mc.profile?.id ?? a.uuid,
    expiresAt: new Date(mc.exp).toISOString(),
    needsRelogin: false,
    encryptedToken: encryptToken(JSON.stringify(tokenOf(mc, previousRefresh)))
  }))
}

function markNeedsRelogin(id: string): void {
  const stored = getStore().get().accounts.find((a) => a.id === id)
  if (!stored || stored.needsRelogin) return
  updateStored(id, (a) => ({ ...a, needsRelogin: true }))
  notify({
    type: 'warning',
    title: 'Microsoft sign-in needed',
    body: `The session for ${stored.username} has ended. Sign in again from the Accounts page; your account stays in the launcher.`
  })
}

/** Errors that reach the UI: say what to do, not just what failed. */
function friendlyError(err: unknown, username: string): Error {
  if (err instanceof SessionEndedError || sessionEnded(err)) {
    return new SessionEndedError(`The Microsoft session for ${username} has ended. Sign in again from the Accounts page.`)
  }
  if (httpFailure(err)?.status === 429) {
    return new Error('Microsoft is limiting sign-in requests right now. Wait a minute and try again.')
  }
  return new Error(
    `Couldn't reach Microsoft to refresh the session for ${username} (${asError(err).message}). Check your connection and try again.`
  )
}

/**
 * A working Minecraft session whose token stays valid for at least
 * `minValidityMs`, refreshing it (and saving the rotated refresh token) when
 * needed. If Microsoft can't be reached but the current token still works, that
 * token is used rather than failing. A session Microsoft rejected flags the
 * account for sign-in, which is the only thing that fixes it.
 */
async function ensureSession(id: string, minValidityMs: number, force = false): Promise<Minecraft> {
  const stored = findStored(id)
  if (stored.type !== 'microsoft') throw new Error('Only Microsoft accounts have a Minecraft session.')

  let token: StoredToken
  try {
    token = readToken(stored)
  } catch (err) {
    markNeedsRelogin(id)
    throw friendlyError(err, stored.username)
  }
  if (!force && token.exp - Date.now() > minValidityMs) return sessionFromToken(token)

  let task = inflight.get(id)
  if (!task) {
    task = (async () => {
      const xbox = await new Auth('select_account').refresh(token.refresh)
      const mc = await xbox.getMinecraft()
      persistSession(id, mc, token.refresh)
      return mc
    })()
    inflight.set(id, task)
    void task.catch(() => undefined).finally(() => inflight.delete(id))
  }

  try {
    return await task
  } catch (err) {
    if (sessionEnded(err)) {
      markNeedsRelogin(id)
    } else if (token.exp - Date.now() > API_VALIDITY_MS) {
      console.warn(`[accounts] refresh failed for ${stored.username}, using the current token:`, asError(err).message)
      return sessionFromToken(token)
    }
    throw friendlyError(err, stored.username)
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
    let mc: Minecraft
    try {
      const auth = new Auth('select_account')
      const xbox = await auth.launch('electron', {
        title: 'Sign in to Microsoft - FvC Launcher',
        backgroundColor: '#0F1115',
        width: 480,
        height: 640
      })
      mc = await xbox.getMinecraft()
    } catch (err) {
      throw asError(err)
    }
    if (!mc.profile?.id) {
      throw new Error('This Microsoft account does not own Minecraft: Java Edition.')
    }

    const file = getStore().get()
    const existing = file.accounts.find((a) => a.type === 'microsoft' && a.uuid === mc.profile!.id)
    // Signing in again to an account that's already here repairs it in place.
    const account = mcAccountFromMsmc(mc, existing?.id)
    if (existing) account.addedAt = existing.addedAt

    const accounts = existing
      ? file.accounts.map((a) => (a.id === existing.id ? account : a))
      : [...file.accounts, account]
    save({ accounts, activeId: file.activeId ?? account.id })
    return toPublic(account)
  },

  /** "Refresh session" button: always asks Microsoft for a new token. */
  async refresh(id: string): Promise<Account> {
    const stored = findStored(id)
    if (stored.type === 'offline') return toPublic(stored)
    try {
      await ensureSession(id, 0, true)
    } catch (err) {
      // A session that ended already notified; tell the user about anything else.
      if (!(err instanceof SessionEndedError)) {
        notify({ type: 'error', title: 'Could not refresh the session', body: asError(err).message })
      }
      throw err
    }
    return toPublic(findStored(id))
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

    const mc = await ensureSession(id, LAUNCH_VALIDITY_MS)
    return mc.mclc(true) as unknown as Record<string, unknown>
  },

  /** A valid Minecraft access token, for Microsoft-only APIs such as changing the skin. */
  async getAccessToken(id: string): Promise<string> {
    const mc = await ensureSession(id, API_VALIDITY_MS)
    return mc.mcToken
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
   * Startup: renew Microsoft sessions that are expired or close to it, so the
   * next Play doesn't wait on Microsoft. Accounts flagged earlier are retried
   * too: older versions flagged them on any error, including being offline.
   * Temporary failures stay quiet; only a session Microsoft rejected asks the
   * user to sign in again. Nothing blocks the UI.
   */
  refreshAllInBackground(): void {
    for (const account of getStore().get().accounts) {
      if (account.type !== 'microsoft') continue
      void ensureSession(account.id, LAUNCH_VALIDITY_MS, !!account.needsRelogin).catch((err) => {
        console.warn(`[accounts] background refresh for ${account.username}:`, asError(err).message)
      })
    }
  }
}
