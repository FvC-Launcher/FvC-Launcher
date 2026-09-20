import type { ResolvedSkin, SkinModel } from '@shared/types'

/**
 * Skin lookup for the (work-in-progress) Skin page.
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

export const skinsService = {
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
