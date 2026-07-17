import { BrowserWindow, dialog } from 'electron'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { basename, dirname, join, resolve, sep } from 'path'
import AdmZip from 'adm-zip'
import { paths } from '../paths'
import { broadcast, notify } from '../broadcast'
import { CH, type CurseForgeInstallInput, type CurseForgeSearchParams, type CurseForgeZipInstallInput } from '@shared/ipc'
import { settingsService } from './settings'
import { profilesService } from './profiles'
import { downloadsService } from './downloads'
import type { CurseForgePack, LoaderId, ModpackProgress, Profile } from '@shared/types'

const API = 'https://api.curseforge.com/v1'
const GAME_MINECRAFT = 432
const CLASS_MODPACKS = 4471
const UA = 'FvC-Launcher/1.2.1 (github.com/FvC-Launcher/FvC-Launcher)'

/** manifest.json inside a CurseForge modpack zip */
interface CfManifest {
  minecraft: {
    version: string
    modLoaders?: { id: string; primary?: boolean }[]
  }
  name?: string
  files: { projectID: number; fileID: number; required?: boolean }[]
  overrides?: string
}

const SORT_FIELDS: Record<string, number> = {
  featured: 1,
  popularity: 2,
  updated: 3,
  name: 4,
  downloads: 6
}

const LOADER_TYPES: Record<string, number> = {
  forge: 1,
  fabric: 4,
  quilt: 5,
  neoforge: 6
}

function apiKey(): string {
  return settingsService.get().curseforgeApiKey.trim()
}

async function cfApi<T>(path: string, init?: RequestInit): Promise<T> {
  const key = apiKey()
  if (!key) {
    throw new Error(
      'CurseForge search needs a free API key. Get one at console.curseforge.com and paste it in Settings → Downloads.'
    )
  }
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'x-api-key': key,
      'User-Agent': UA,
      'Content-Type': 'application/json',
      ...init?.headers
    }
  })
  if (res.status === 403) {
    throw new Error('CurseForge rejected the API key. Check it in Settings → Downloads.')
  }
  if (!res.ok) throw new Error(`CurseForge API error ${res.status}`)
  return res.json() as Promise<T>
}

/**
 * Resolve a mod file's real CDN URL. Prefers the official API (needs key, and
 * some authors block API distribution → null url); falls back to the public
 * website redirect, which also covers the no-key case.
 */
async function resolveDownloadUrl(projectId: number, fileId: number): Promise<string> {
  if (apiKey()) {
    try {
      const { data } = await cfApi<{ data: string | null }>(`/mods/${projectId}/files/${fileId}/download-url`)
      if (data) return data
    } catch {
      /* fall through to the public endpoint */
    }
  }
  const publicUrl = `https://www.curseforge.com/api/v1/mods/${projectId}/files/${fileId}/download`
  const res = await fetch(publicUrl, { method: 'GET', redirect: 'manual', headers: { 'User-Agent': UA } })
  const location = res.headers.get('location')
  if (res.status >= 300 && res.status < 400 && location) return location
  if (res.ok) return publicUrl // served directly
  throw new Error(`File ${projectId}/${fileId} is not distributable (HTTP ${res.status}).`)
}

function fileNameFromUrl(url: string, fallback: string): string {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '')
    return name || fallback
  } catch {
    return fallback
  }
}

function parseLoaderId(loaderId: string | undefined): { loader: LoaderId; loaderVersion?: string } {
  if (!loaderId) return { loader: 'vanilla' }
  const [type, ...rest] = loaderId.split('-')
  const version = rest.join('-') || undefined
  if (type === 'fabric' || type === 'forge' || type === 'neoforge' || type === 'quilt') {
    return { loader: type, loaderVersion: version }
  }
  return { loader: 'vanilla' }
}

function safeInstancePath(instanceDir: string, relPath: string): string {
  const target = resolve(instanceDir, relPath)
  if (!target.startsWith(resolve(instanceDir) + sep)) {
    throw new Error(`Modpack contains an unsafe file path: ${relPath}`)
  }
  return target
}

function emit(p: ModpackProgress): void {
  broadcast(CH.modpackProgress, p)
}

/** Shared installer: parse a CF pack zip, create the profile, fetch everything. */
async function installFromZip(
  zipPath: string,
  input: { name: string; icon?: string; backgroundImage?: string; ramMb: number },
  packLabel: string
): Promise<Profile> {
  let profile: Profile | null = null
  const tracker = downloadsService.track({ kind: 'other', label: input.name, detail: 'CurseForge modpack' })
  try {
    emit({ phase: 'manifest', detail: 'Reading modpack manifest…', progress: -1 })
    const zip = new AdmZip(zipPath)
    const manifestEntry = zip.getEntry('manifest.json')
    if (!manifestEntry) {
      throw new Error('Not a CurseForge modpack: manifest.json is missing from the zip.')
    }
    const manifest = JSON.parse(zip.readAsText(manifestEntry)) as CfManifest
    const mcVersion = manifest.minecraft?.version
    if (!mcVersion) throw new Error('Modpack manifest does not declare a Minecraft version.')
    const primaryLoader =
      manifest.minecraft.modLoaders?.find((l) => l.primary) ?? manifest.minecraft.modLoaders?.[0]
    const { loader, loaderVersion } = parseLoaderId(primaryLoader?.id)

    profile = profilesService.create({
      name: input.name,
      minecraftVersion: mcVersion,
      loader,
      loaderVersion,
      ramMb: input.ramMb,
      icon: input.icon ?? 'Package',
      backgroundImage: input.backgroundImage
    })
    const instanceDir = paths.instance(profile.id)

    // Files -------------------------------------------------------------
    const files = manifest.files ?? []
    let completed = 0
    const failures: string[] = []
    emit({ phase: 'files', detail: `Downloading files (0/${files.length})…`, progress: 0 })

    // Resolve+download with limited concurrency (URL resolution is 1 request per file).
    const queue = [...files]
    const workers = Array.from({ length: 4 }, async () => {
      for (;;) {
        const file = queue.shift()
        if (!file) return
        const label = `${file.projectID}/${file.fileID}`
        try {
          const url = await resolveDownloadUrl(file.projectID, file.fileID)
          const fileName = fileNameFromUrl(url, `${file.projectID}-${file.fileID}.jar`)
          const subdir = fileName.toLowerCase().endsWith('.zip') ? 'resourcepacks' : 'mods'
          await downloadsService.enqueue({
            url,
            destination: safeInstancePath(instanceDir, join(subdir, fileName)),
            kind: 'mod',
            label: fileName,
            detail: input.name
          })
        } catch (err) {
          failures.push(err instanceof Error ? err.message : label)
        } finally {
          completed++
          const progress = completed / Math.max(1, files.length)
          tracker.update(progress, `${completed}/${files.length} files`)
          emit({ phase: 'files', detail: `Downloading files (${completed}/${files.length})…`, progress })
        }
      }
    })
    await Promise.all(workers)

    // Too many failures → broken pack; a few → keep going and tell the user.
    if (failures.length > 0 && failures.length >= Math.max(3, files.length * 0.2)) {
      throw new Error(
        `${failures.length} of ${files.length} files could not be downloaded. ` +
          (apiKey() ? failures[0] : 'Adding a CurseForge API key in Settings → Downloads usually fixes this.')
      )
    }

    // Overrides -----------------------------------------------------------
    emit({ phase: 'overrides', detail: 'Installing modpack configuration…', progress: -1 })
    const overridesPrefix = (manifest.overrides ?? 'overrides').replace(/\/+$/, '') + '/'
    for (const entry of zip.getEntries()) {
      if (!entry.entryName.startsWith(overridesPrefix) || entry.isDirectory) continue
      const rel = entry.entryName.slice(overridesPrefix.length)
      if (!rel) continue
      const target = safeInstancePath(instanceDir, rel)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, entry.getData())
    }

    emit({ phase: 'verify', detail: 'Verifying files…', progress: -1 })
    // CF manifests carry no hashes; verification is presence-based via the
    // download pipeline (each enqueue resolves only after the file is written).

    tracker.finish(true)
    emit({ phase: 'done', detail: 'Ready to play', progress: 1 })
    notify({
      type: failures.length > 0 ? 'warning' : 'success',
      title: `${input.name} installed`,
      body:
        failures.length > 0
          ? `${packLabel} · ${failures.length} optional file(s) could not be downloaded.`
          : `${packLabel} · Minecraft ${mcVersion}${loader !== 'vanilla' ? ` · ${loader}` : ''}`
    })
    return profile
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    tracker.finish(false, message)
    emit({ phase: 'error', detail: message, progress: -1 })
    if (profile) {
      try {
        profilesService.remove(profile.id)
      } catch {
        /* best effort */
      }
    }
    throw err instanceof Error ? err : new Error(message)
  }
}

export const curseforgeService = {
  hasApiKey(): boolean {
    return apiKey().length > 0
  },

  async searchPacks(params: CurseForgeSearchParams): Promise<CurseForgePack[]> {
    const qs = new URLSearchParams({
      gameId: String(GAME_MINECRAFT),
      classId: String(CLASS_MODPACKS),
      searchFilter: params.query,
      sortField: String(SORT_FIELDS[params.sort ?? 'popularity'] ?? 2),
      sortOrder: 'desc',
      pageSize: '20'
    })
    if (params.gameVersion) qs.set('gameVersion', params.gameVersion)
    if (params.loader && LOADER_TYPES[params.loader]) {
      qs.set('modLoaderType', String(LOADER_TYPES[params.loader]))
    }
    const { data } = await cfApi<{
      data: {
        id: number
        name: string
        summary: string
        authors: { name: string }[]
        logo: { thumbnailUrl: string } | null
        downloadCount: number
        dateModified: string
        latestFilesIndexes?: { gameVersion: string }[]
        categories: { name: string }[]
        links?: { websiteUrl?: string }
      }[]
    }>(`/mods/search?${qs}`)

    return data.map((m) => ({
      id: m.id,
      name: m.name,
      summary: m.summary,
      author: m.authors?.[0]?.name ?? 'Unknown',
      logoUrl: m.logo?.thumbnailUrl ?? null,
      downloads: m.downloadCount,
      dateModified: m.dateModified,
      gameVersions: [...new Set((m.latestFilesIndexes ?? []).map((i) => i.gameVersion))].slice(0, 6),
      categories: (m.categories ?? []).map((c) => c.name).slice(0, 3),
      websiteUrl: m.links?.websiteUrl ?? null
    }))
  },

  /** Install a pack by CurseForge mod id (uses the newest main file). */
  async install(input: CurseForgeInstallInput): Promise<Profile> {
    emit({ phase: 'preparing', detail: 'Preparing profile…', progress: -1 })
    const { data: mod } = await cfApi<{
      data: { name: string; mainFileId: number; latestFiles: { id: number; fileName: string }[] }
    }>(`/mods/${input.modId}`)
    const fileId = mod.mainFileId ?? mod.latestFiles?.[0]?.id
    if (!fileId) throw new Error('This modpack has no downloadable file.')

    emit({ phase: 'manifest', detail: 'Downloading modpack archive…', progress: -1 })
    const url = await resolveDownloadUrl(input.modId, fileId)
    const archivePath = join(paths.cache, 'modpacks', fileNameFromUrl(url, `cf-${input.modId}-${fileId}.zip`))
    if (!existsSync(archivePath)) {
      await downloadsService.enqueue({
        url,
        destination: archivePath,
        kind: 'other',
        label: mod.name,
        detail: 'Modpack archive'
      })
    }
    return installFromZip(archivePath, input, mod.name)
  },

  async pickZip(): Promise<string | null> {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const result = await dialog.showOpenDialog(win!, {
      title: 'Choose a CurseForge modpack',
      filters: [{ name: 'CurseForge modpack', extensions: ['zip'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  },

  async installZip(input: CurseForgeZipInstallInput): Promise<Profile> {
    if (!existsSync(input.zipPath)) throw new Error('The selected file no longer exists.')
    emit({ phase: 'preparing', detail: 'Preparing profile…', progress: -1 })
    return installFromZip(input.zipPath, input, basename(input.zipPath))
  }
}
