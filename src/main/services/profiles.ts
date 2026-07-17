import { dialog, shell, BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import AdmZip from 'adm-zip'
import { JsonStore } from '../store'
import { paths } from '../paths'
import { broadcast } from '../broadcast'
import { CH, type CreateProfileInput } from '@shared/ipc'
import type { Profile } from '@shared/types'

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

  /** Exports profile.json + instance folder into a .fvcpack zip. */
  async export(id: string): Promise<string | null> {
    const profile = this.get(id)
    if (!profile) throw new Error('Profile not found.')
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showSaveDialog(win!, {
      title: 'Export profile',
      defaultPath: `${profile.name.replace(/[^\w\- ]+/g, '')}.fvcpack`,
      filters: [{ name: 'FvC Profile Pack', extensions: ['fvcpack'] }]
    })
    if (result.canceled || !result.filePath) return null

    const zip = new AdmZip()
    zip.addFile('profile.json', Buffer.from(JSON.stringify(profile, null, 2), 'utf-8'))
    const dir = paths.instance(id)
    // Exclude bulky, regenerable folders from exports.
    const skip = new Set(['saves', 'screenshots', 'logs'])
    if (existsSync(dir)) {
      for (const sub of INSTANCE_SUBDIRS.filter((s) => !skip.has(s))) {
        const subPath = join(dir, sub)
        if (existsSync(subPath)) zip.addLocalFolder(subPath, `instance/${sub}`)
      }
      const optionsTxt = join(dir, 'options.txt')
      if (existsSync(optionsTxt)) zip.addLocalFile(optionsTxt, 'instance')
    }
    zip.writeZip(result.filePath)
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

    const zip = new AdmZip(result.filePaths[0])
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
    const dest = paths.instance(profile.id)
    for (const zipEntry of zip.getEntries()) {
      if (zipEntry.entryName.startsWith('instance/') && !zipEntry.isDirectory) {
        const rel = zipEntry.entryName.slice('instance/'.length)
        const target = join(dest, rel)
        mkdirSync(join(target, '..'), { recursive: true })
        writeFileSync(target, zipEntry.getData())
      }
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
