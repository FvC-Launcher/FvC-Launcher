import { join } from 'path'
import { paths } from '../paths'
import { downloadsService } from './downloads'
import { profilesService } from './profiles'
import { notify } from '../broadcast'
import type { ModrinthSearchParams } from '@shared/ipc'
import type {
  ContentKind,
  DownloadKind,
  ModrinthProject,
  ModrinthSearchResult,
  ModrinthVersion,
  Profile
} from '@shared/types'

const API = 'https://api.modrinth.com/v2'
const UA = 'FvC-Launcher/1.0.0 (github.com/fvc-launcher)'

// Small in-memory GET cache to keep the UI snappy and be kind to the API.
const cache = new Map<string, { at: number; data: unknown }>()
const CACHE_TTL = 5 * 60_000

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const key = init ? null : path
  if (key) {
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.data as T
  }
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'User-Agent': UA, 'Content-Type': 'application/json', ...init?.headers }
  })
  if (!res.ok) throw new Error(`Modrinth API error ${res.status}: ${await res.text()}`)
  const data = (await res.json()) as T
  if (key) cache.set(key, { at: Date.now(), data })
  return data
}

const KIND_TO_PROJECT_TYPE: Record<ContentKind, string> = {
  mod: 'mod',
  resourcepack: 'resourcepack',
  shaderpack: 'shader'
}

const KIND_TO_DIR: Record<ContentKind, string> = {
  mod: 'mods',
  resourcepack: 'resourcepacks',
  shaderpack: 'shaderpacks'
}

const KIND_TO_DL: Record<ContentKind, DownloadKind> = {
  mod: 'mod',
  resourcepack: 'resourcepack',
  shaderpack: 'shaderpack'
}

/** Loaders where mods are loader-specific. RP/shaders ignore the loader facet. */
function loaderFacetApplies(projectType: string): boolean {
  return projectType === 'mod'
}

export const modrinthService = {
  async search(params: ModrinthSearchParams): Promise<ModrinthSearchResult> {
    const facets: string[][] = [[`project_type:${params.projectType}`]]
    if (params.gameVersion) facets.push([`versions:${params.gameVersion}`])
    if (params.loader && loaderFacetApplies(params.projectType)) {
      facets.push([`categories:${params.loader}`])
    }
    for (const cat of params.categories ?? []) facets.push([`categories:${cat}`])

    const qs = new URLSearchParams({
      query: params.query,
      facets: JSON.stringify(facets),
      index: params.index ?? 'relevance',
      offset: String(params.offset ?? 0),
      limit: String(params.limit ?? 20)
    })
    return api<ModrinthSearchResult>(`/search?${qs}`)
  },

  async featured(): Promise<ModrinthSearchResult> {
    const qs = new URLSearchParams({
      query: '',
      facets: JSON.stringify([['project_type:mod']]),
      index: 'follows',
      limit: '8'
    })
    return api<ModrinthSearchResult>(`/search?${qs}`)
  },

  project(idOrSlug: string): Promise<ModrinthProject> {
    return api<ModrinthProject>(`/project/${encodeURIComponent(idOrSlug)}`)
  },

  async versions(
    idOrSlug: string,
    gameVersion?: string,
    loader?: string
  ): Promise<ModrinthVersion[]> {
    const qs = new URLSearchParams()
    if (gameVersion) qs.set('game_versions', JSON.stringify([gameVersion]))
    if (loader) qs.set('loaders', JSON.stringify([loader]))
    const suffix = qs.size > 0 ? `?${qs}` : ''
    return api<ModrinthVersion[]>(`/project/${encodeURIComponent(idOrSlug)}/version${suffix}`)
  },

  async getVersion(versionId: string): Promise<ModrinthVersion> {
    return api<ModrinthVersion>(`/version/${encodeURIComponent(versionId)}`)
  },

  /** Bulk hash lookup: sha1 → version (used to identify installed files). */
  async versionsByHashes(sha1s: string[]): Promise<Record<string, ModrinthVersion>> {
    if (sha1s.length === 0) return {}
    return api<Record<string, ModrinthVersion>>('/version_files', {
      method: 'POST',
      body: JSON.stringify({ hashes: sha1s, algorithm: 'sha1' })
    })
  },

  /** Bulk update check: sha1 → newest matching version. */
  async latestByHashes(
    sha1s: string[],
    gameVersion: string,
    loader?: string
  ): Promise<Record<string, ModrinthVersion>> {
    if (sha1s.length === 0) return {}
    return api<Record<string, ModrinthVersion>>('/version_files/update', {
      method: 'POST',
      body: JSON.stringify({
        hashes: sha1s,
        algorithm: 'sha1',
        loaders: loader ? [loader] : [],
        game_versions: [gameVersion]
      })
    })
  },

  async projectsByIds(ids: string[]): Promise<ModrinthProject[]> {
    if (ids.length === 0) return []
    const qs = new URLSearchParams({ ids: JSON.stringify(ids) })
    return api<ModrinthProject[]>(`/projects?${qs}`)
  },

  /**
   * Pick the best version of a project for a profile, honoring MC version and
   * (for mods) the loader.
   */
  async resolveVersion(
    projectId: string,
    profile: Profile,
    kind: ContentKind
  ): Promise<ModrinthVersion | null> {
    const loader = kind === 'mod' && profile.loader !== 'vanilla' ? profile.loader : undefined
    const versions = await this.versions(projectId, profile.minecraftVersion, loader)
    if (versions.length === 0) return null
    const releases = versions.filter((v) => v.version_type === 'release')
    return releases[0] ?? versions[0]
  },

  /**
   * Install a project (and its required dependencies, recursively) into the
   * profile's isolated content folder.
   */
  async install(
    profileId: string,
    kind: ContentKind,
    projectId: string,
    versionId?: string,
    seen: Set<string> = new Set()
  ): Promise<void> {
    const profile = profilesService.get(profileId)
    if (!profile) throw new Error('Profile not found.')
    if (kind === 'mod' && profile.loader === 'vanilla') {
      throw new Error('Vanilla profiles cannot load mods. Create a modded profile first.')
    }
    if (seen.has(projectId)) return
    seen.add(projectId)

    const version = versionId
      ? await this.getVersion(versionId)
      : await this.resolveVersion(projectId, profile, kind)
    if (!version) {
      const project = await this.project(projectId).catch(() => null)
      throw new Error(
        `No compatible version of ${project?.title ?? projectId} for Minecraft ` +
          `${profile.minecraftVersion}${kind === 'mod' ? ` (${profile.loader})` : ''}.`
      )
    }

    const file = version.files.find((f) => f.primary) ?? version.files[0]
    if (!file) throw new Error('Version has no downloadable files.')

    const project = await this.project(version.project_id).catch(() => null)
    const destination = join(paths.instance(profileId), KIND_TO_DIR[kind], file.filename)

    await downloadsService.enqueue({
      url: file.url,
      destination,
      kind: KIND_TO_DL[kind],
      label: project?.title ?? file.filename,
      detail: `${version.version_number} → ${profile.name}`
    })

    // Required dependencies (mods only — packs have none in practice).
    if (kind === 'mod') {
      for (const dep of version.dependencies ?? []) {
        if (dep.dependency_type !== 'required') continue
        try {
          if (dep.project_id) {
            await this.install(profileId, kind, dep.project_id, dep.version_id ?? undefined, seen)
          } else if (dep.version_id) {
            const depVersion = await this.getVersion(dep.version_id)
            await this.install(profileId, kind, depVersion.project_id, dep.version_id, seen)
          }
        } catch (err) {
          notify({
            type: 'warning',
            title: 'Dependency skipped',
            body: err instanceof Error ? err.message : String(err)
          })
        }
      }
    }
  },

  projectTypeFor(kind: ContentKind): string {
    return KIND_TO_PROJECT_TYPE[kind]
  },

  dirFor(kind: ContentKind): string {
    return KIND_TO_DIR[kind]
  }
}
