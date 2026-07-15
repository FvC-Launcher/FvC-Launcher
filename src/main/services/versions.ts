import type { LoaderId, LoaderVersionInfo, McVersion } from '@shared/types'

const cache = new Map<string, { at: number; data: unknown }>()
const TTL = 10 * 60_000

async function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.data as T
  const data = await fetcher()
  cache.set(key, { at: Date.now(), data })
  return data
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'User-Agent': 'FvC-Launcher/1.0.0' } })
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  return res.json() as Promise<T>
}

interface PistonManifest {
  latest: { release: string; snapshot: string }
  versions: { id: string; type: string; url: string; releaseTime: string }[]
}

export const versionsService = {
  async minecraft(includeSnapshots: boolean): Promise<McVersion[]> {
    const manifest = await cached('mc-manifest', () =>
      getJson<PistonManifest>('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json')
    )
    return manifest.versions
      .filter((v) => v.type === 'release' || (includeSnapshots && v.type === 'snapshot'))
      .map((v) => ({
        id: v.id,
        type: v.type as McVersion['type'],
        releaseTime: v.releaseTime
      }))
  },

  async loader(loader: LoaderId, gameVersion: string): Promise<LoaderVersionInfo[]> {
    switch (loader) {
      case 'vanilla':
        return []
      case 'fabric':
        return cached(`fabric-${gameVersion}`, async () => {
          const list = await getJson<{ loader: { version: string; stable: boolean } }[]>(
            `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(gameVersion)}`
          )
          return list.map((e) => ({ version: e.loader.version, stable: e.loader.stable }))
        })
      case 'quilt':
        return cached(`quilt-${gameVersion}`, async () => {
          const list = await getJson<{ loader: { version: string } }[]>(
            `https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(gameVersion)}`
          )
          return list.map((e) => ({
            version: e.loader.version,
            stable: !e.loader.version.includes('beta') && !e.loader.version.includes('pre')
          }))
        })
      case 'forge':
        return cached(`forge-${gameVersion}`, async () => {
          const [byGame, promos] = await Promise.all([
            getJson<Record<string, string[]>>(
              'https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.json'
            ),
            getJson<{ promos: Record<string, string> }>(
              'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json'
            ).catch(() => ({ promos: {} as Record<string, string> }))
          ])
          const entries = byGame[gameVersion] ?? []
          const recommended = promos.promos[`${gameVersion}-recommended`]
          const latest = promos.promos[`${gameVersion}-latest`]
          return entries
            .map((full) => {
              const version = full.split('-')[1] ?? full
              return {
                version,
                stable: version === recommended || version === latest,
                recommended: version === recommended
              }
            })
            .reverse() // newest first
        })
      case 'neoforge':
        return cached(`neoforge-${gameVersion}`, async () => {
          const data = await getJson<{ versions: string[] }>(
            'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge'
          )
          // NeoForge versions look like "21.1.62" where "21.1" maps to MC 1.21.1.
          const [, major = '', minor = ''] = /^1\.(\d+)(?:\.(\d+))?/.exec(gameVersion) ?? []
          const prefix = `${major}.${minor || '0'}.`
          return data.versions
            .filter((v) => v.startsWith(prefix))
            .map((version) => ({ version, stable: !version.includes('beta') }))
            .reverse()
        })
    }
  }
}
