import { existsSync, mkdirSync, rmSync } from 'fs'
import { inflateRawSync } from 'zlib'
import { join } from 'path'
import AdmZip from 'adm-zip'
import { paths } from '../paths'
import { notify } from '../broadcast'
import { downloadsService } from './downloads'
import { applyPackFiles, profilesService } from './profiles'
import { normalizeGithubRepo } from '../util/safePath'
import type { CommunityPack, LoaderId, Profile } from '@shared/types'

const UA = 'FvC-Launcher/2.0.0 (github.com/FvC-Launcher/FvC-Launcher)'

interface GithubRelease {
  id: number
  tag_name: string
  name?: string
  assets: { name: string; browser_download_url: string; size: number }[]
}

const COMMUNITY_TOPIC = 'fvc-modpack'
const IGNORED_REPOS = new Set(['fvc-launcher/fvc-launcher'])
const COMMUNITY_CACHE_TTL = 10 * 60_000
let communityCache: { at: number; data: CommunityPack[] } | null = null

interface GithubSearchRepo {
  full_name: string
  name: string
  description: string | null
  html_url: string
  stargazers_count: number
  pushed_at: string
  topics?: string[]
  owner: { login: string }
}

const LOADER_IDS: LoaderId[] = ['fabric', 'forge', 'neoforge', 'quilt', 'vanilla']

/** Reads bytes [start, end] of a URL via a Range request; null if the server won't. */
async function fetchRange(url: string, start: number, end: number): Promise<Buffer | null> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Range: `bytes=${start}-${end}` } })
  if (res.status !== 206) return null
  return Buffer.from(await res.arrayBuffer())
}

/**
 * Reads `profile.json` out of a remote .fvcpack without downloading the whole
 * file: the zip's central directory at the tail tells where the entry lives,
 * then only that entry is fetched. Any failure just yields null.
 */
export async function peekZipEntry(
  read: (start: number, end: number) => Promise<Buffer | null>,
  totalSize: number,
  entryName: string
): Promise<Buffer | null> {
  try {
    // 1. Tail: End Of Central Directory record (22 bytes + up to 64K comment).
    const tailStart = Math.max(0, totalSize - 65_557)
    const tail = await read(tailStart, totalSize - 1)
    if (!tail) return null
    let eocd = -1
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        eocd = i
        break
      }
    }
    if (eocd < 0) return null
    const cdSize = tail.readUInt32LE(eocd + 12)
    const cdOffset = tail.readUInt32LE(eocd + 16)
    if (cdSize === 0xffffffff || cdOffset === 0xffffffff) return null // zip64

    // 2. Central directory (often already inside the tail we have).
    let cd: Buffer | null
    if (cdOffset >= tailStart) {
      cd = tail.subarray(cdOffset - tailStart, cdOffset - tailStart + cdSize)
    } else {
      cd = await read(cdOffset, cdOffset + cdSize - 1)
    }
    if (!cd || cd.length < cdSize) return null

    // 3. Walk entries until we find the one we want.
    let pos = 0
    while (pos + 46 <= cd.length && cd.readUInt32LE(pos) === 0x02014b50) {
      const method = cd.readUInt16LE(pos + 10)
      const compressed = cd.readUInt32LE(pos + 20)
      const nameLen = cd.readUInt16LE(pos + 28)
      const extraLen = cd.readUInt16LE(pos + 30)
      const commentLen = cd.readUInt16LE(pos + 32)
      const localOffset = cd.readUInt32LE(pos + 42)
      const name = cd.subarray(pos + 46, pos + 46 + nameLen).toString('utf-8')
      if (name === entryName) {
        if (compressed > 1024 * 1024) return null
        // 4. Local header + data. The local extra field may differ in length.
        const head = await read(localOffset, localOffset + 30 + nameLen + 1024 + compressed)
        if (!head || head.readUInt32LE(0) !== 0x04034b50) return null
        const lNameLen = head.readUInt16LE(26)
        const lExtraLen = head.readUInt16LE(28)
        const dataStart = 30 + lNameLen + lExtraLen
        if (head.length < dataStart + compressed) return null
        const data = head.subarray(dataStart, dataStart + compressed)
        return method === 8 ? inflateRawSync(data) : method === 0 ? Buffer.from(data) : null
      }
      pos += 46 + nameLen + extraLen + commentLen
    }
    return null
  } catch {
    return null
  }
}

async function peekPackProfile(url: string, size: number): Promise<Partial<Profile> | null> {
  const raw = await peekZipEntry((a, b) => fetchRange(url, a, b), size, 'profile.json')
  if (!raw) return null
  try {
    return JSON.parse(raw.toString('utf-8')) as Partial<Profile>
  } catch {
    return null
  }
}

function loaderFromTopics(topics: string[] | undefined, text: string): LoaderId | undefined {
  const haystack = [...(topics ?? []), text.toLowerCase()]
  return LOADER_IDS.find((id) => haystack.some((t) => t.includes(id)))
}

/** Thrown when GitHub cannot be reached; the launch continues with the installed version. */
class OfflineError extends Error {}

async function fetchLatestRelease(repo: string): Promise<GithubRelease> {
  let res: Response
  try {
    res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { 'User-Agent': UA, Accept: 'application/vnd.github+json' }
    })
  } catch (err) {
    throw new OfflineError(err instanceof Error ? err.message : String(err))
  }
  if (res.status === 403 || res.status === 429) {
    throw new OfflineError('GitHub API rate limit reached. Try again later.')
  }
  if (res.status === 404) {
    throw new Error(`No releases found on github.com/${repo}. Ask the pack author to publish one.`)
  }
  if (!res.ok) throw new OfflineError(`GitHub API error ${res.status}`)
  return (await res.json()) as GithubRelease
}

function findPackAsset(release: GithubRelease, repo: string): GithubRelease['assets'][number] {
  const asset = release.assets.find((a) => a.name.toLowerCase().endsWith('.fvcpack'))
  if (!asset) {
    throw new Error(`Release ${release.tag_name} on github.com/${repo} has no .fvcpack attached.`)
  }
  return asset
}

/** Downloads a release's .fvcpack into the pack cache and returns its path. */
async function downloadPack(
  release: GithubRelease,
  repo: string,
  label: string,
  key: string
): Promise<string> {
  const asset = findPackAsset(release, repo)
  const cacheDir = join(paths.cache, 'packs')
  mkdirSync(cacheDir, { recursive: true })
  const packPath = join(cacheDir, `${key}-${release.id}.fvcpack`)
  await downloadsService.enqueue({
    url: asset.browser_download_url,
    destination: packPath,
    kind: 'other',
    label,
    detail: `Pack ${release.tag_name}`
  })
  return packPath
}

export const packUpdaterService = {
  /** Lists repos tagged `fvc-modpack` whose latest release ships a .fvcpack. */
  async listCommunityPacks(): Promise<CommunityPack[]> {
    if (communityCache && Date.now() - communityCache.at < COMMUNITY_CACHE_TTL) {
      return communityCache.data
    }
    const url =
      `https://api.github.com/search/repositories?q=topic:${COMMUNITY_TOPIC}` +
      '&sort=updated&order=desc&per_page=100'
    let res: Response
    try {
      res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/vnd.github+json' } })
    } catch (err) {
      throw new Error(`Could not reach GitHub: ${err instanceof Error ? err.message : String(err)}`)
    }
    if (res.status === 403 || res.status === 429) {
      throw new Error('GitHub API rate limit reached. Try again in a few minutes.')
    }
    if (!res.ok) throw new Error(`GitHub API error ${res.status}`)
    const search = (await res.json()) as { items: GithubSearchRepo[] }
    const repos = search.items.filter((r) => !IGNORED_REPOS.has(r.full_name.toLowerCase()))

    const results = await Promise.allSettled(
      repos.map(async (r): Promise<CommunityPack | null> => {
        const release = await fetchLatestRelease(r.full_name)
        const asset = release.assets.find((a) => a.name.toLowerCase().endsWith('.fvcpack'))
        if (!asset) return null
        const peeked = await peekPackProfile(asset.browser_download_url, asset.size)
        const text = `${r.description ?? ''}`
        return {
          repo: r.full_name,
          name: peeked?.name?.trim() || r.name,
          author: r.owner.login,
          description: r.description ?? undefined,
          version: release.tag_name,
          releaseId: release.id,
          loader: peeked?.loader ?? loaderFromTopics(r.topics, text),
          minecraftVersion: peeked?.minecraftVersion,
          stars: r.stargazers_count,
          updatedAt: r.pushed_at,
          url: r.html_url,
          sizeBytes: asset.size
        }
      })
    )
    const packs = results
      .map((r) => (r.status === 'fulfilled' ? r.value : null))
      .filter((p): p is CommunityPack => p !== null)
    communityCache = { at: Date.now(), data: packs }
    return packs
  },

  /** Imports the latest release of a GitHub repo as a new auto-updating profile. */
  async importFromGithub(repoInput: string): Promise<Profile> {
    const repo = normalizeGithubRepo(repoInput)
    if (!repo) {
      throw new Error('Enter a valid GitHub repository link, e.g. https://github.com/owner/repo')
    }
    let release: GithubRelease
    try {
      release = await fetchLatestRelease(repo)
    } catch (err) {
      if (err instanceof OfflineError) {
        throw new Error(`Could not reach GitHub: ${err.message}`)
      }
      throw err
    }
    const packPath = await downloadPack(release, repo, repo, `import-${Date.now()}`)
    try {
      const profile = profilesService.importFromFile(packPath, {
        repo,
        releaseId: release.id,
        tag: release.tag_name
      })
      notify({
        type: 'success',
        title: `${profile.name} imported`,
        body: `${release.tag_name} from github.com/${repo}. Updates install automatically when you press Play.`
      })
      return profile
    } finally {
      rmSync(packPath, { force: true })
    }
  },

  /**
   * Makes sure a GitHub-backed profile matches the latest release.
   * Resolves with the (possibly updated) profile. Network problems are
   * reported as a warning and the current files are kept.
   */
  async ensureUpToDate(profile: Profile, onStatus: (detail: string) => void): Promise<Profile> {
    const source = profile.packSource
    if (!source || source.type !== 'fvc-github-pack') return profile

    onStatus('Checking for pack updates…')
    let release: GithubRelease
    try {
      release = await fetchLatestRelease(source.repo)
    } catch (err) {
      if (err instanceof OfflineError) {
        notify({
          type: 'warning',
          title: 'Could not check for pack updates',
          body: `${err.message} Launching the installed version.`
        })
        return profile
      }
      throw err
    }
    if (release.id === source.installedReleaseId) return profile

    // Download --------------------------------------------------------------
    onStatus(`Downloading pack update ${release.tag_name}…`)
    const packPath = await downloadPack(release, source.repo, profile.name, profile.id)

    // Apply -----------------------------------------------------------------
    onStatus(`Installing pack update ${release.tag_name}…`)
    try {
      const zip = new AdmZip(packPath)
      const entry = zip.getEntry('profile.json')
      if (!entry) throw new Error('Downloaded pack is not a valid FvC profile pack.')
      const packed = JSON.parse(zip.readAsText(entry)) as Profile
      const packedSource = packed.packSource
      const mode = packedSource?.mode ?? source.mode
      const removeOld = packedSource?.removeOld ?? source.removeOld

      const instanceDir = paths.instance(profile.id)
      // Never resets options.txt or existing configs; see applyPackFiles.
      const written = applyPackFiles(zip, instanceDir, { onlyMods: mode === 'mods', update: true })

      // Only mods are ever removed. Resource packs, shaders, configs and
      // settings stay even when the author drops them from the pack.
      if (removeOld) {
        const keep = new Set(written)
        for (const rel of source.managedFiles ?? []) {
          if (!rel.startsWith('mods/') || keep.has(rel)) continue
          const abs = join(instanceDir, rel)
          if (existsSync(abs)) rmSync(abs, { force: true })
        }
      }

      const updated = profilesService.update(profile.id, {
        minecraftVersion: packed.minecraftVersion ?? profile.minecraftVersion,
        loader: packed.loader ?? profile.loader,
        loaderVersion:
          packed.loader === 'vanilla' ? undefined : (packed.loaderVersion ?? profile.loaderVersion),
        packSource: {
          type: 'fvc-github-pack',
          formatVersion: 1,
          repo: source.repo,
          mode,
          removeOld,
          installedReleaseId: release.id,
          installedTag: release.tag_name,
          managedFiles: written
        }
      })
      notify({
        type: 'success',
        title: `${profile.name} updated`,
        body: `Now on ${release.tag_name} from github.com/${source.repo}`
      })
      return updated
    } finally {
      rmSync(packPath, { force: true })
    }
  }
}
