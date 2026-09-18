import { dialog, shell, BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import AdmZip from 'adm-zip'
import { JsonStore } from '../store'
import { paths } from '../paths'
import { broadcast } from '../broadcast'
import { CH, type CreateProfileInput } from '@shared/ipc'
import { safeInstancePath, normalizeGithubRepo } from '../util/safePath'
import type { GithubExportOptions, Profile, ProfileExportMode } from '@shared/types'

interface ProfilesFile {
  profiles: Profile[]
  selectedId: string | null
}

let store: JsonStore<ProfilesFile> | null = null

function getStore(): JsonStore<ProfilesFile> {
  if (!store) {
    store = new JsonStore<ProfilesFile>(paths.file('profiles.json'), {
      profiles: [],
      selectedId: null
    })
  }
  return store
}

const INSTANCE_SUBDIRS = [
  'mods',
  'config',
  'resourcepacks',
  'shaderpacks',
  'saves',
  'screenshots',
  'logs'
]

function save(file: ProfilesFile): void {
  getStore().set(file)
  broadcast(CH.profilesChanged)
}

/**
 * Writes every `instance/*` entry of a .fvcpack into the instance folder and
 * returns the instance-relative paths the pack provides.
 *
 * In `update` mode the player's own state is preserved: options.txt is never
 * touched and existing config files are left as they are (new config files
 * from new mods are still added). Mods, resource packs and shader packs are
 * written normally so the author can ship newer versions of them.
 */
export function applyPackFiles(
  zip: AdmZip,
  instanceDir: string,
  opts: { onlyMods?: boolean; update?: boolean } = {}
): string[] {
  const written: string[] = []
  for (const zipEntry of zip.getEntries()) {
    if (!zipEntry.entryName.startsWith('instance/') || zipEntry.isDirectory) continue
    const rel = zipEntry.entryName.slice('instance/'.length).replace(/\\/g, '/')
    if (!rel) continue
    if (opts.onlyMods && !rel.startsWith('mods/')) continue
    const target = safeInstancePath(instanceDir, rel)
    if (opts.update) {
      if (rel === 'options.txt') continue
      if (rel.startsWith('config/') && existsSync(target)) {
        written.push(rel)
        continue
      }
    }
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, zipEntry.getData())
    written.push(rel)
  }
  return written
}

function ensureInstanceDirs(id: string): void {
  const root = paths.instance(id)
  for (const sub of INSTANCE_SUBDIRS) mkdirSync(join(root, sub), { recursive: true })
}

export const profilesService = {
  list(): Profile[] {
    return getStore().get().profiles
  },

  get(id: string): Profile | undefined {
    return getStore().get().profiles.find((p) => p.id === id)
  },

  getSelectedId(): string | null {
    const file = getStore().get()
    if (file.selectedId && file.profiles.some((p) => p.id === file.selectedId)) {
      return file.selectedId
    }
    return file.profiles[0]?.id ?? null
  },

  setSelected(id: string): void {
    save({ ...getStore().get(), selectedId: id })
  },

  create(input: CreateProfileInput): Profile {
    const name = input.name.trim()
    if (!name) throw new Error('Profile name cannot be empty.')
    const profile: Profile = {
      id: randomUUID(),
      name,
      icon: input.icon ?? 'Package',
      backgroundImage: input.backgroundImage || undefined,
      minecraftVersion: input.minecraftVersion,
      loader: input.loader,
      loaderVersion: input.loader === 'vanilla' ? undefined : input.loaderVersion,
      ramMb: input.ramMb,
      favorite: false,
      createdAt: new Date().toISOString(),
      playTimeSeconds: 0
    }
    ensureInstanceDirs(profile.id)
    const file = getStore().get()
    save({ profiles: [...file.profiles, profile], selectedId: profile.id })
    return profile
  },

  update(id: string, patch: Partial<Profile>): Profile {
    const file = getStore().get()
    const existing = file.profiles.find((p) => p.id === id)
    if (!existing) throw new Error('Profile not found.')
    // Never allow identity fields to be patched.
    const { id: _id, createdAt: _c, ...safePatch } = patch
    const updated = { ...existing, ...safePatch }
    save({ ...file, profiles: file.profiles.map((p) => (p.id === id ? updated : p)) })
    return updated
  },

  duplicate(id: string): Profile {
    const file = getStore().get()
    const source = file.profiles.find((p) => p.id === id)
    if (!source) throw new Error('Profile not found.')
    const copy: Profile = {
      ...source,
      id: randomUUID(),
      name: `${source.name} (copy)`,
      favorite: false,
      createdAt: new Date().toISOString(),
      lastPlayed: undefined,
      playTimeSeconds: 0
    }
    ensureInstanceDirs(copy.id)
    const srcDir = paths.instance(source.id)
    if (existsSync(srcDir)) {
      cpSync(srcDir, paths.instance(copy.id), { recursive: true })
    }
    save({ ...file, profiles: [...file.profiles, copy] })
    return copy
  },

  remove(id: string): void {
    const file = getStore().get()
    const profiles = file.profiles.filter((p) => p.id !== id)
    rmSync(paths.instance(id), { recursive: true, force: true })
    save({
      profiles,
      selectedId: file.selectedId === id ? (profiles[0]?.id ?? null) : file.selectedId
    })
  },

  async openFolder(id: string): Promise<void> {
    ensureInstanceDirs(id)
    await shell.openPath(paths.instance(id))
  },

  /**
   * Exports profile.json + instance folder into a .fvcpack zip.
   * `mode === 'mods'` ships only the mods folder; `'everything'` also includes
   * configs, resource/shader packs and options.txt.
   */
  async export(
    id: string,
    mode: ProfileExportMode = 'everything',
    github?: GithubExportOptions
  ): Promise<string | null> {
    const profile = this.get(id)
    if (!profile) throw new Error('Profile not found.')
    let repo: string | null = null
    if (github) {
      repo = normalizeGithubRepo(github.repo)
      if (!repo) {
        throw new Error('Enter a valid GitHub repository link, e.g. https://github.com/owner/repo')
      }
    }
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showSaveDialog(win!, {
      title: 'Export profile',
      defaultPath: `${profile.name.replace(/[^\w\- ]+/g, '')}.fvcpack`,
      filters: [{ name: 'FvC Profile Pack', extensions: ['fvcpack'] }]
    })
    if (result.canceled || !result.filePath) return null

    // Local-only bookkeeping never leaves this machine; the exported pack
    // either carries a clean GitHub source or none at all.
    const { packSource: _ps, ...exportable } = profile
    const packed: Profile =
      repo && github
        ? {
            ...exportable,
            packSource: {
              type: 'fvc-github-pack',
              formatVersion: 1,
              repo,
              mode,
              removeOld: github.removeOld
            }
          }
        : exportable
    const zip = new AdmZip()
    zip.addFile('profile.json', Buffer.from(JSON.stringify(packed, null, 2), 'utf-8'))
    const dir = paths.instance(id)
    // Exclude bulky, regenerable folders from exports.
    const skip = new Set(['saves', 'screenshots', 'logs'])
    const subdirs = mode === 'mods' ? ['mods'] : INSTANCE_SUBDIRS.filter((s) => !skip.has(s))
    if (existsSync(dir)) {
      for (const sub of subdirs) {
        const subPath = join(dir, sub)
        if (existsSync(subPath)) zip.addLocalFolder(subPath, `instance/${sub}`)
      }
      const optionsTxt = join(dir, 'options.txt')
      if (mode === 'everything' && existsSync(optionsTxt)) zip.addLocalFile(optionsTxt, 'instance')
    }
    zip.writeZip(result.filePath)
    // Remember the repo so the next export of this profile is pre-filled.
    if (repo && github) {
      this.update(id, {
        packSource: {
          ...(profile.packSource ?? {}),
          type: 'fvc-github-pack',
          formatVersion: 1,
          repo,
          mode,
          removeOld: github.removeOld
        }
      })
    }
    return result.filePath
  },

  async import(): Promise<Profile | null> {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      title: 'Import profile',
      filters: [{ name: 'FvC Profile Pack', extensions: ['fvcpack', 'zip'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return this.importFromFile(result.filePaths[0])
  },

  /**
   * Imports a .fvcpack from disk. `github` marks the new profile as backed by
   * that repo/release even if the pack itself was exported without a source.
   */
  importFromFile(
    filePath: string,
    github?: { repo: string; releaseId: number; tag: string }
  ): Profile {
    const zip = new AdmZip(filePath)
    const entry = zip.getEntry('profile.json')
    if (!entry) throw new Error('Not a valid FvC profile pack (profile.json missing).')
    const imported = JSON.parse(zip.readAsText(entry)) as Profile

    const profile: Profile = {
      ...imported,
      id: randomUUID(),
      name: imported.name,
      favorite: false,
      createdAt: new Date().toISOString(),
      lastPlayed: undefined,
      playTimeSeconds: 0
    }
    ensureInstanceDirs(profile.id)
    const written = applyPackFiles(zip, paths.instance(profile.id))
    const src = imported.packSource
    const packRepo =
      src && src.type === 'fvc-github-pack' && typeof src.repo === 'string' ? src.repo : null
    if (packRepo || github) {
      profile.packSource = {
        type: 'fvc-github-pack',
        formatVersion: 1,
        // A pack fetched from GitHub follows the repo it was fetched from.
        repo: github?.repo ?? packRepo!,
        mode: src?.mode === 'mods' ? 'mods' : 'everything',
        removeOld: src?.removeOld !== false,
        installedReleaseId: github?.releaseId,
        installedTag: github?.tag,
        managedFiles: written
      }
    } else {
      delete profile.packSource
    }
    const file = getStore().get()
    save({ profiles: [...file.profiles, profile], selectedId: profile.id })
    return profile
  },

  /** Marks shared version/loader files for re-verification on next launch. */
  repair(id: string): void {
    const profile = this.get(id)
    if (!profile) throw new Error('Profile not found.')
    // Remove the cached loader version JSONs so they are re-installed, and
    // let MCLC re-verify vanilla files on next launch.
    const versionsDir = join(paths.meta, 'versions')
    if (existsSync(versionsDir)) {
      const prefixes = ['fabric-loader', 'quilt-loader']
      for (const prefix of prefixes) {
        const candidate = join(
          versionsDir,
          `${prefix}-${profile.loaderVersion}-${profile.minecraftVersion}`
        )
        rmSync(candidate, { recursive: true, force: true })
      }
    }
    ensureInstanceDirs(id)
  },

  addPlaySession(id: string, seconds: number): void {
    const file = getStore().get()
    const profile = file.profiles.find((p) => p.id === id)
    if (!profile) return
    const updated: Profile = {
      ...profile,
      lastPlayed: new Date().toISOString(),
      playTimeSeconds: profile.playTimeSeconds + Math.max(0, Math.round(seconds))
    }
    save({ ...file, profiles: file.profiles.map((p) => (p.id === id ? updated : p)) })
  }
}
