import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomBytes } from 'crypto'
import { JsonStore } from '../store'
import { paths } from '../paths'
import { accountsService } from './accounts'
import type { AppliedSkin, Profile, ResolvedSkin, SkinModel } from '@shared/types'

/**
 * The deployed skin-server/ Worker, without a trailing slash. While empty,
 * applied skins still show for yourself in game but aren't shared.
 */
const SKIN_SERVER_URL = 'https://fvc-skins.fvcskins.workers.dev'

const MOD_FILE = 'fvc-skins.jar'
const BUNDLED_MOD = join(__dirname, '../../resources/mods', MOD_FILE)
/** The skin server's limit; real skins are a few KB. */
const MAX_APPLIED_BYTES = 64 * 1024

/**
 * Skin lookup for the Skin page, and applying skins to offline accounts.
 *
 * Everything is fetched here rather than in the renderer: the renderer's CSP
 * only allows connecting to Modrinth, and drawing a remote texture onto a
 * canvas would taint it. Returning a data: URL sidesteps both.
 */

const UA = 'FvC-Launcher (github.com/fvc-launcher)'
const MOJANG_PROFILE = 'https://api.mojang.com/users/profiles/minecraft'
const MOJANG_SESSION = 'https://sessionserver.mojang.com/session/minecraft/profile'
/** Serves the correct default skin for a uuid when the profile has none. */
const DEFAULT_SKIN = 'https://api.mcheads.org/skin'

const NAME_RE = /^[A-Za-z0-9_]{1,16}$/
const MAX_BYTES = 2 * 1024 * 1024

// Same query -> same texture for a few minutes; the page re-resolves on every
// preview click and Mojang rate-limits name lookups fairly aggressively.
const cache = new Map<string, { at: number; skin: ResolvedSkin }>()
const CACHE_TTL = 5 * 60_000

interface MojangProfile {
  id: string
  name: string
}

interface SessionProfile {
  id: string
  name: string
  properties?: { name: string; value: string }[]
}

interface TexturesPayload {
  textures?: {
    SKIN?: { url: string; metadata?: { model?: string } }
  }
}

async function getJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  // Mojang answers 204/404 for an unknown name instead of an error body.
  if (res.status === 204 || res.status === 404) return null
  if (!res.ok) throw new Error(`Mojang API error ${res.status}`)
  return (await res.json()) as T
}

/** Reads width/height out of a PNG IHDR; throws if the bytes are not a PNG. */
function pngSize(bytes: Buffer): { width: number; height: number } {
  const signature = '89504e470d0a1a0a'
  if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== signature) {
    throw new Error('That file is not a PNG image.')
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

/** Downloads a skin texture and validates it looks like a Minecraft skin. */
async function fetchTexture(url: string): Promise<string> {
  let res: Response
  try {
    res = await fetch(url, { headers: { 'User-Agent': UA } })
  } catch {
    throw new Error('Could not reach that URL.')
  }
  if (!res.ok) throw new Error(`The skin URL returned ${res.status}.`)

  const bytes = Buffer.from(await res.arrayBuffer())
  if (bytes.byteLength > MAX_BYTES) throw new Error('That image is too large to be a skin.')

  const { width, height } = pngSize(bytes)
  // 64x64 is the modern layout; 64x32 is the pre-1.8 one, still accepted.
  if (width !== 64 || (height !== 64 && height !== 32)) {
    throw new Error(`A skin must be 64x64 (or 64x32), but that image is ${width}x${height}.`)
  }
  return `data:image/png;base64,${bytes.toString('base64')}`
}

async function resolveUsername(name: string): Promise<ResolvedSkin> {
  const profile = await getJson<MojangProfile>(`${MOJANG_PROFILE}/${encodeURIComponent(name)}`)
  if (!profile) throw new Error(`No Minecraft account named "${name}".`)

  const session = await getJson<SessionProfile>(`${MOJANG_SESSION}/${profile.id}`)
  const encoded = session?.properties?.find((p) => p.name === 'textures')?.value
  const textures = encoded
    ? (JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as TexturesPayload)
    : {}
  const skin = textures.textures?.SKIN

  // No custom skin on the account — fall back to its default Steve/Alex.
  const textureUrl = skin?.url ?? `${DEFAULT_SKIN}/${profile.id}`
  const model: SkinModel = skin?.metadata?.model === 'slim' ? 'slim' : 'classic'

  return {
    dataUrl: await fetchTexture(textureUrl),
    model,
    source: 'username',
    username: profile.name,
    uuid: profile.id,
    textureUrl,
    isDefault: !skin
  }
}

async function resolveUrl(url: string): Promise<ResolvedSkin> {
  return {
    dataUrl: await fetchTexture(url),
    // A bare PNG carries no model metadata, so assume the wide arms.
    model: 'classic',
    source: 'url',
    textureUrl: url
  }
}

interface AppliedRecord {
  model: SkinModel
  appliedAt: string
  shared: boolean
}

interface SkinsFile {
  /** Proves to the skin server that this install owns the names it uploaded. */
  secret: string
  applied: Record<string, AppliedRecord>
}

let store: JsonStore<SkinsFile> | null = null

function getStore(): JsonStore<SkinsFile> {
  if (!store) {
    store = new JsonStore<SkinsFile>(paths.file('skins.json'), { secret: '', applied: {} })
    if (!store.get().secret) {
      store.set({ ...store.get(), secret: randomBytes(32).toString('hex') })
    }
  }
  return store
}

function skinFile(accountId: string): string {
  return join(paths.userData, 'skins', `${accountId}.png`)
}

function saveRecord(accountId: string, record: AppliedRecord | null): void {
  const file = getStore().get()
  const applied = { ...file.applied }
  if (record) applied[accountId] = record
  else delete applied[accountId]
  getStore().set({ ...file, applied })
}

function offlineAccount(accountId: string): { username: string } {
  const account = accountsService.list().find((a) => a.id === accountId)
  if (!account) throw new Error('Account not found.')
  if (account.type !== 'offline') {
    throw new Error('Skins can only be applied to offline accounts.')
  }
  return account
}

class NameTakenError extends Error {}

async function serverRequest(
  method: 'PUT' | 'DELETE',
  username: string,
  body?: { png: Buffer; model: SkinModel }
): Promise<void> {
  const res = await fetch(`${SKIN_SERVER_URL}/skins/${encodeURIComponent(username)}`, {
    method,
    headers: {
      'User-Agent': UA,
      Authorization: `Bearer ${getStore().get().secret}`,
      ...(body ? { 'Content-Type': 'image/png', 'X-Skin-Model': body.model } : {})
    },
    body: body ? new Uint8Array(body.png) : undefined,
    signal: AbortSignal.timeout(10_000)
  })
  if (res.status === 403) {
    throw new NameTakenError(
      `The name "${username}" is already used by another FvC Launcher player on the skin server. ` +
        'Use an offline account with a different name.'
    )
  }
  if (!res.ok) throw new Error(`Skin server error ${res.status}: ${await res.text()}`)
}

/** Uploads when possible; returns whether other players can now see the skin. */
async function share(username: string, png: Buffer, model: SkinModel): Promise<boolean> {
  if (!SKIN_SERVER_URL) return false
  try {
    await serverRequest('PUT', username, { png, model })
    return true
  } catch (err) {
    if (err instanceof NameTakenError) throw err
    console.warn('[skins] upload failed:', err)
    return false
  }
}

export const skinsService = {
  getApplied(accountId: string): AppliedSkin | null {
    const record = getStore().get().applied[accountId]
    const file = skinFile(accountId)
    if (!record || !existsSync(file)) return null
    return {
      accountId,
      dataUrl: `data:image/png;base64,${readFileSync(file).toString('base64')}`,
      model: record.model,
      appliedAt: record.appliedAt,
      shared: record.shared
    }
  },

  async apply(accountId: string, dataUrl: string, model: SkinModel): Promise<AppliedSkin> {
    const { username } = offlineAccount(accountId)
    const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl)
    if (!match) throw new Error('That skin is not a PNG image.')
    const png = Buffer.from(match[1], 'base64')
    if (png.byteLength > MAX_APPLIED_BYTES) throw new Error('That skin file is too large (max 64 KB).')
    const { width, height } = pngSize(png)
    if (width !== 64 || (height !== 64 && height !== 32)) {
      throw new Error(`A skin must be 64x64 (or 64x32), but that image is ${width}x${height}.`)
    }

    const shared = await share(username, png, model)
    mkdirSync(join(paths.userData, 'skins'), { recursive: true })
    writeFileSync(skinFile(accountId), png)
    saveRecord(accountId, { model, appliedAt: new Date().toISOString(), shared })
    return this.getApplied(accountId)!
  },

  async remove(accountId: string): Promise<void> {
    const account = accountsService.list().find((a) => a.id === accountId)
    if (SKIN_SERVER_URL && account) {
      await serverRequest('DELETE', account.username).catch((err) =>
        console.warn('[skins] delete failed:', err)
      )
    }
    this.forget(accountId)
  },

  /** Drops the local copy only (the account itself is gone). */
  forget(accountId: string): void {
    rmSync(skinFile(accountId), { force: true })
    saveRecord(accountId, null)
  },

  /**
   * Before launch: Fabric 26.2 instances get the bundled FvC Skins mod plus its
   * config (the active account's name and applied skin); any other instance
   * gets the mod removed so a version change can't leave an incompatible jar.
   */
  async prepareInstance(profile: Profile, accountId: string): Promise<void> {
    const gameDir = paths.instance(profile.id)
    const modsDir = join(gameDir, 'mods')
    const modPath = join(modsDir, MOD_FILE)

    if (profile.loader !== 'fabric' || profile.minecraftVersion !== '26.2') {
      rmSync(modPath, { force: true })
      rmSync(`${modPath}.disabled`, { force: true })
      return
    }
    if (!existsSync(BUNDLED_MOD)) {
      console.warn(`[skins] ${BUNDLED_MOD} is missing; run "npm run build:mod".`)
      return
    }
    // A disabled copy means the player turned the mod off in the mods list.
    if (!existsSync(`${modPath}.disabled`)) {
      mkdirSync(modsDir, { recursive: true })
      writeFileSync(modPath, readFileSync(BUNDLED_MOD))
    }

    const account = accountsService.list().find((a) => a.id === accountId)
    const applied = account?.type === 'offline' ? this.getApplied(accountId) : null
    const configDir = join(gameDir, 'config')
    const skinDir = join(configDir, 'fvc-skins')
    mkdirSync(skinDir, { recursive: true })

    if (applied && account) {
      const png = readFileSync(skinFile(accountId))
      writeFileSync(join(skinDir, 'skin.png'), png)
      if (!applied.shared) {
        const shared = await share(account.username, png, applied.model).catch(() => false)
        if (shared) saveRecord(accountId, { ...getStore().get().applied[accountId], shared })
      }
    } else {
      rmSync(join(skinDir, 'skin.png'), { force: true })
    }

    const config = {
      serverUrl: SKIN_SERVER_URL || null,
      username: account?.username ?? null,
      skin: Boolean(applied),
      model: applied?.model ?? 'classic'
    }
    writeFileSync(join(configDir, 'fvc-skins.json'), JSON.stringify(config, null, 2), 'utf-8')
  },

  /** Accepts a direct https:// link to a skin PNG, or a Minecraft username. */
  async resolve(query: string): Promise<ResolvedSkin> {
    const trimmed = query.trim()
    if (!trimmed) throw new Error('Enter a skin URL or a player name.')

    const hit = cache.get(trimmed)
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.skin

    let skin: ResolvedSkin
    if (/^https?:\/\//i.test(trimmed)) {
      skin = await resolveUrl(trimmed)
    } else if (NAME_RE.test(trimmed)) {
      skin = await resolveUsername(trimmed)
    } else {
      throw new Error('That is neither a valid player name nor an http(s) link.')
    }

    cache.set(trimmed, { at: Date.now(), skin })
    return skin
  }
}
