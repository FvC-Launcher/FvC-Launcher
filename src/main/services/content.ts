import { createHash } from 'crypto'
import { existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'fs'
import { join } from 'path'
import AdmZip from 'adm-zip'
import { paths } from '../paths'
import { modrinthService } from './modrinth'
import { profilesService } from './profiles'
import type { ContentKind, InstalledContent } from '@shared/types'

const EXTENSIONS: Record<ContentKind, string[]> = {
  mod: ['.jar'],
  resourcepack: ['.zip'],
  shaderpack: ['.zip']
}

function contentDir(profileId: string, kind: ContentKind): string {
  return join(paths.instance(profileId), modrinthService.dirFor(kind))
}

function sha1Of(filePath: string): string {
  return createHash('sha1').update(readFileSync(filePath)).digest('hex')
}

/** Best-effort mod name/version from jar metadata (fabric/quilt/forge/neoforge). */
function readJarMetadata(filePath: string): { name?: string; version?: string; author?: string } {
  try {
    const zip = new AdmZip(filePath)
    const fabric = zip.getEntry('fabric.mod.json') ?? zip.getEntry('quilt.mod.json')
    if (fabric) {
      const meta = JSON.parse(zip.readAsText(fabric))
      const inner = meta.quilt_loader ?? meta // quilt nests its metadata
      return {
        name: inner.name ?? meta.name,
        version: inner.version ?? meta.version,
        author: Array.isArray(meta.authors)
          ? typeof meta.authors[0] === 'string'
            ? meta.authors[0]
            : meta.authors[0]?.name
          : undefined
      }
    }
    const toml = zip.getEntry('META-INF/mods.toml') ?? zip.getEntry('META-INF/neoforge.mods.toml')
    if (toml) {
      const text = zip.readAsText(toml)
      const name = /displayName\s*=\s*"([^"]+)"/.exec(text)?.[1]
      const version = /version\s*=\s*"([^"]+)"/.exec(text)?.[1]
      const author = /authors\s*=\s*"([^"]+)"/.exec(text)?.[1]
      return { name, version: version === '${file.jarVersion}' ? undefined : version, author }
    }
  } catch {
    // Not a readable archive — fall through.
  }
  return {}
}

// sha1 → resolved modrinth identity cache (avoids re-hashing lookups)
const identityCache = new Map<
  string,
  { projectId: string; versionId: string; versionNumber: string; iconUrl?: string; title?: string }
>()

export const contentService = {
  async list(profileId: string, kind: ContentKind): Promise<InstalledContent[]> {
    const dir = contentDir(profileId, kind)
    if (!existsSync(dir)) return []

    const items: InstalledContent[] = []
    for (const entry of readdirSync(dir)) {
      const enabled = !entry.endsWith('.disabled')
      const baseName = enabled ? entry : entry.slice(0, -'.disabled'.length)
      if (!EXTENSIONS[kind].some((ext) => baseName.toLowerCase().endsWith(ext))) continue
      const full = join(dir, entry)
      const stat = statSync(full)
      if (!stat.isFile()) continue
      items.push({
        fileName: entry,
        enabled,
        fileSize: stat.size,
        sha1: sha1Of(full)
      })
    }

    // Identify via Modrinth bulk hash lookup, cache results.
    const unknown = items.filter((i) => i.sha1 && !identityCache.has(i.sha1))
    if (unknown.length > 0) {
      try {
        const found = await modrinthService.versionsByHashes(unknown.map((i) => i.sha1!))
        const projectIds = [...new Set(Object.values(found).map((v) => v.project_id))]
        const projects = await modrinthService.projectsByIds(projectIds)
        const projectById = new Map(projects.map((p) => [p.id, p]))
        for (const [hash, version] of Object.entries(found)) {
          const project = projectById.get(version.project_id)
          identityCache.set(hash, {
            projectId: version.project_id,
            versionId: version.id,
            versionNumber: version.version_number,
            iconUrl: project?.icon_url ?? undefined,
            title: project?.title
          })
        }
      } catch (err) {
        console.error('[content] modrinth hash lookup failed:', err)
      }
    }

    for (const item of items) {
      const identity = item.sha1 ? identityCache.get(item.sha1) : undefined
      if (identity) {
        item.modrinthProjectId = identity.projectId
        item.modrinthVersionId = identity.versionId
        item.version = identity.versionNumber
        item.iconUrl = identity.iconUrl
        item.name = identity.title
      }
      if (!item.name && kind === 'mod') {
        const dir2 = contentDir(profileId, kind)
        const meta = readJarMetadata(join(dir2, item.fileName))
        item.name = meta.name
        item.version = item.version ?? meta.version
        item.author = meta.author
      }
      if (!item.name) {
        item.name = item.fileName.replace(/\.(jar|zip)(\.disabled)?$/i, '')
      }
    }

    return items.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
  },

  toggle(profileId: string, kind: ContentKind, fileName: string, enabled: boolean): void {
    const dir = contentDir(profileId, kind)
    const current = join(dir, fileName)
    if (!existsSync(current)) throw new Error('File not found.')
    const isDisabled = fileName.endsWith('.disabled')
    if (enabled && isDisabled) {
      renameSync(current, join(dir, fileName.slice(0, -'.disabled'.length)))
    } else if (!enabled && !isDisabled) {
      renameSync(current, join(dir, fileName + '.disabled'))
    }
  },

  remove(profileId: string, kind: ContentKind, fileName: string, keepConfig: boolean): void {
    const dir = contentDir(profileId, kind)
    rmSync(join(dir, fileName), { force: true })
    if (kind === 'mod' && !keepConfig) {
      // Best-effort config cleanup: <modid>.* files under config/ matching jar base name.
      const base = fileName
        .replace(/\.(jar)(\.disabled)?$/i, '')
        .split(/[-_ ]/)[0]
        ?.toLowerCase()
      if (base && base.length >= 3) {
        const configDir = join(paths.instance(profileId), 'config')
        if (existsSync(configDir)) {
          for (const entry of readdirSync(configDir)) {
            if (entry.toLowerCase().startsWith(base)) {
              rmSync(join(configDir, entry), { recursive: true, force: true })
            }
          }
        }
      }
    }
  },

  /** Annotate installed items with available updates. */
  async checkUpdates(profileId: string, kind: ContentKind): Promise<InstalledContent[]> {
    const profile = profilesService.get(profileId)
    if (!profile) throw new Error('Profile not found.')
    const items = await this.list(profileId, kind)
    const withHash = items.filter((i) => i.sha1 && i.modrinthProjectId)
    try {
      const loader = kind === 'mod' && profile.loader !== 'vanilla' ? profile.loader : undefined
      const latest = await modrinthService.latestByHashes(
        withHash.map((i) => i.sha1!),
        profile.minecraftVersion,
        loader
      )
      for (const item of withHash) {
        const newest = latest[item.sha1!]
        if (newest && newest.id !== item.modrinthVersionId) {
          item.updateVersionId = newest.id
          item.updateVersionNumber = newest.version_number
        }
      }
    } catch (err) {
      console.error('[content] update check failed:', err)
    }
    return items
  },

  /** Replace an installed file with its newest matching Modrinth version. */
  async update(profileId: string, kind: ContentKind, fileName: string): Promise<void> {
    const items = await this.checkUpdates(profileId, kind)
    const item = items.find((i) => i.fileName === fileName)
    if (!item?.updateVersionId || !item.modrinthProjectId) return
    await modrinthService.install(profileId, kind, item.modrinthProjectId, item.updateVersionId)
    // Remove the old file only after the new one downloaded successfully.
    rmSync(join(contentDir(profileId, kind), fileName), { force: true })
  },

  /** Names of enabled mods that declare the given mod as a required dependency. */
  async dependents(profileId: string, fileName: string): Promise<string[]> {
    const items = await this.list(profileId, 'mod')
    const target = items.find((i) => i.fileName === fileName)
    if (!target?.modrinthProjectId) return []

    const result: string[] = []
    for (const item of items) {
      if (item.fileName === fileName || !item.modrinthVersionId || !item.enabled) continue
      try {
        const version = await modrinthService.getVersion(item.modrinthVersionId)
        if (
          version.dependencies?.some(
            (d) => d.dependency_type === 'required' && d.project_id === target.modrinthProjectId
          )
        ) {
          result.push(item.name ?? item.fileName)
        }
      } catch {
        // Ignore lookup failures; treat as no dependency.
      }
    }
    return result
  }
}
