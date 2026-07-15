import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { dirname, join, resolve, sep } from 'path'
import AdmZip from 'adm-zip'
import { paths } from '../paths'
import { broadcast, notify } from '../broadcast'
import { CH, type ModpackInstallInput } from '@shared/ipc'
import { modrinthService } from './modrinth'
import { profilesService } from './profiles'
import { downloadsService } from './downloads'
import type { LoaderId, ModpackProgress, Profile } from '@shared/types'

/** modrinth.index.json inside a .mrpack */
interface MrpackIndex {
  formatVersion: number
  name: string
  versionId: string
  files: {
    path: string
    hashes: { sha1: string; sha512?: string }
    env?: { client: 'required' | 'optional' | 'unsupported' }
    downloads: string[]
    fileSize: number
  }[]
  dependencies: Record<string, string>
}

function emit(p: ModpackProgress): void {
  broadcast(CH.modpackProgress, p)
}

function loaderFromDependencies(deps: Record<string, string>): {
  loader: LoaderId
  loaderVersion?: string
} {
  if (deps['fabric-loader']) return { loader: 'fabric', loaderVersion: deps['fabric-loader'] }
  if (deps['quilt-loader']) return { loader: 'quilt', loaderVersion: deps['quilt-loader'] }
  if (deps['neoforge']) return { loader: 'neoforge', loaderVersion: deps['neoforge'] }
  if (deps['forge']) return { loader: 'forge', loaderVersion: deps['forge'] }
  return { loader: 'vanilla' }
}

/** Resolve a manifest-relative path, refusing anything escaping the instance dir. */
function safeInstancePath(instanceDir: string, relPath: string): string {
  const target = resolve(instanceDir, relPath)
  if (!target.startsWith(resolve(instanceDir) + sep)) {
    throw new Error(`Modpack contains an unsafe file path: ${relPath}`)
  }
  return target
}

function sha1Of(filePath: string): string {
  return createHash('sha1').update(readFileSync(filePath)).digest('hex')
}

export const modpacksService = {
  async install(input: ModpackInstallInput): Promise<Profile> {
    let profile: Profile | null = null
    const tracker = downloadsService.track({ kind: 'other', label: input.name, detail: 'Modpack' })
    try {
      // 1. Manifest --------------------------------------------------------
      emit({ phase: 'preparing', detail: 'Preparing profile…', progress: -1 })
      const version = await modrinthService.getVersion(input.versionId)
      const project = await modrinthService.project(version.project_id).catch(() => null)
      const mrpackFile =
        version.files.find((f) => f.filename.endsWith('.mrpack')) ??
        version.files.find((f) => f.primary) ??
        version.files[0]
      if (!mrpackFile) throw new Error('This modpack version has no downloadable file.')

      emit({ phase: 'manifest', detail: 'Downloading modpack manifest…', progress: -1 })
      const archivePath = join(paths.cache, 'modpacks', mrpackFile.filename)
      if (!existsSync(archivePath)) {
        await downloadsService.enqueue({
          url: mrpackFile.url,
          destination: archivePath,
          kind: 'other',
          label: project?.title ?? input.name,
          detail: 'Modpack archive'
        })
      }

      const zip = new AdmZip(archivePath)
      const indexEntry = zip.getEntry('modrinth.index.json')
      if (!indexEntry) throw new Error('Invalid modpack: modrinth.index.json missing.')
      const index = JSON.parse(zip.readAsText(indexEntry)) as MrpackIndex

      const mcVersion = index.dependencies['minecraft']
      if (!mcVersion) throw new Error('Modpack manifest does not declare a Minecraft version.')
      const { loader, loaderVersion } = loaderFromDependencies(index.dependencies)

      // 2. Profile ---------------------------------------------------------
      profile = profilesService.create({
        name: input.name,
        minecraftVersion: mcVersion,
        loader,
        loaderVersion,
        ramMb: input.ramMb,
        icon: input.icon ?? 'Package'
      })
      const instanceDir = paths.instance(profile.id)

      // 3. Files -----------------------------------------------------------
      const files = (index.files ?? []).filter((f) => f.env?.client !== 'unsupported')
      let completed = 0
      emit({ phase: 'files', detail: `Downloading files (0/${files.length})…`, progress: 0 })

      const downloads = files.map(async (file) => {
        const destination = safeInstancePath(instanceDir, file.path)
        if (!file.downloads?.[0]) throw new Error(`No download URL for ${file.path}`)
        await downloadsService.enqueue({
          url: file.downloads[0],
          destination,
          kind: 'mod',
          label: file.path.split('/').pop() ?? file.path,
          detail: input.name
        })
        completed++
        const progress = completed / files.length
        tracker.update(progress, `${completed}/${files.length} files`)
        emit({
          phase: 'files',
          detail: `Downloading files (${completed}/${files.length})…`,
          progress
        })
      })
      const results = await Promise.allSettled(downloads)
      const failed = results.filter((r) => r.status === 'rejected')
      if (failed.length > 0) {
        throw new Error(
          `${failed.length} of ${files.length} modpack files failed to download. ` +
            ((failed[0] as PromiseRejectedResult).reason?.message ?? '')
        )
      }

      // 4. Overrides -------------------------------------------------------
      emit({ phase: 'overrides', detail: 'Installing modpack configuration…', progress: -1 })
      for (const prefix of ['overrides/', 'client-overrides/']) {
        for (const entry of zip.getEntries()) {
          if (!entry.entryName.startsWith(prefix) || entry.isDirectory) continue
          const rel = entry.entryName.slice(prefix.length)
          if (!rel) continue
          const target = safeInstancePath(instanceDir, rel)
          mkdirSync(dirname(target), { recursive: true })
          writeFileSync(target, entry.getData())
        }
      }

      // 5. Verify ----------------------------------------------------------
      emit({ phase: 'verify', detail: 'Verifying files…', progress: -1 })
      for (const file of files) {
        const target = safeInstancePath(instanceDir, file.path)
        if (!existsSync(target) || (file.hashes?.sha1 && sha1Of(target) !== file.hashes.sha1)) {
          throw new Error(`Verification failed for ${file.path}. Try installing again.`)
        }
      }

      tracker.finish(true)
      emit({ phase: 'done', detail: 'Ready to play', progress: 1 })
      notify({
        type: 'success',
        title: `${input.name} installed`,
        body: `${project?.title ?? 'Modpack'} · Minecraft ${mcVersion}${loader !== 'vanilla' ? ` · ${loader}` : ''}`
      })
      return profile
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      tracker.finish(false, message)
      emit({ phase: 'error', detail: message, progress: -1 })
      // Don't leave a half-installed profile behind.
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
}
