// ---------------------------------------------------------------------------
// The typed IPC surface exposed to the renderer via the preload bridge.
// Main implements it, preload forwards it, renderer consumes `window.fvc`.
// ---------------------------------------------------------------------------

import type {
  Account,
  AppSettings,
  ContentKind,
  CurseForgePack,
  DownloadTask,
  HwidFixResult,
  HwidStatus,
  InstalledContent,
  JavaInstall,
  LaunchState,
  LegalStatus,
  LoaderId,
  LoaderVersionInfo,
  McVersion,
  ModpackProgress,
  ModrinthProject,
  ModrinthSearchResult,
  ModrinthVersion,
  NewsItem,
  NotificationPayload,
  Profile,
  UpdaterState
} from './types'

export interface ModrinthSearchParams {
  query: string
  projectType: 'mod' | 'resourcepack' | 'shader' | 'modpack'
  gameVersion?: string
  loader?: string
  categories?: string[]
  index?: 'relevance' | 'downloads' | 'follows' | 'newest' | 'updated'
  offset?: number
  limit?: number
}

export interface ModpackInstallInput {
  name: string
  icon?: string
  backgroundImage?: string
  ramMb: number
  projectId: string
  versionId: string
}

export interface CurseForgeSearchParams {
  query: string
  gameVersion?: string
  loader?: string
  sort?: 'popularity' | 'downloads' | 'updated' | 'featured' | 'name'
}

export interface CurseForgeInstallInput {
  name: string
  icon?: string
  backgroundImage?: string
  ramMb: number
  modId: number
}

export interface CurseForgeZipInstallInput {
  name: string
  icon?: string
  backgroundImage?: string
  ramMb: number
  zipPath: string
}

export interface CreateProfileInput {
  name: string
  minecraftVersion: string
  loader: LoaderId
  loaderVersion?: string
  ramMb: number
  icon?: string
  /** Optional cover image (fvc-file:/// URL) shown on the card and Play page. */
  backgroundImage?: string
}

export interface FvcApi {
  window: {
    minimize(): void
    maximize(): void
    close(): void
    isMaximized(): Promise<boolean>
    onMaximizedChange(cb: (maximized: boolean) => void): () => void
  }
  settings: {
    get(): Promise<AppSettings>
    set(patch: Partial<AppSettings>): Promise<AppSettings>
    reset(): Promise<AppSettings>
  }
  accounts: {
    list(): Promise<Account[]>
    getActive(): Promise<string | null>
    setActive(id: string): Promise<void>
    addOffline(username: string): Promise<Account>
    loginMicrosoft(): Promise<Account>
    refresh(id: string): Promise<Account>
    remove(id: string): Promise<void>
  }
  profiles: {
    list(): Promise<Profile[]>
    create(input: CreateProfileInput): Promise<Profile>
    update(id: string, patch: Partial<Profile>): Promise<Profile>
    duplicate(id: string): Promise<Profile>
    remove(id: string): Promise<void>
    openFolder(id: string): Promise<void>
    exportProfile(id: string): Promise<string | null>
    importProfile(): Promise<Profile | null>
    repair(id: string): Promise<void>
    getSelected(): Promise<string | null>
    setSelected(id: string): Promise<void>
  }
  content: {
    list(profileId: string, kind: ContentKind): Promise<InstalledContent[]>
    toggle(profileId: string, kind: ContentKind, fileName: string, enabled: boolean): Promise<void>
    remove(profileId: string, kind: ContentKind, fileName: string, keepConfig: boolean): Promise<void>
    checkUpdates(profileId: string, kind: ContentKind): Promise<InstalledContent[]>
    update(profileId: string, kind: ContentKind, fileName: string): Promise<void>
    /** Returns names of installed mods that require the given mod (before removal). */
    dependents(profileId: string, fileName: string): Promise<string[]>
  }
  modrinth: {
    search(params: ModrinthSearchParams): Promise<ModrinthSearchResult>
    project(idOrSlug: string): Promise<ModrinthProject>
    versions(idOrSlug: string, gameVersion?: string, loader?: string): Promise<ModrinthVersion[]>
    install(
      profileId: string,
      kind: ContentKind,
      projectId: string,
      versionId?: string
    ): Promise<void>
    featured(): Promise<ModrinthSearchResult>
  }
  versions: {
    minecraft(includeSnapshots: boolean): Promise<McVersion[]>
    loader(loader: LoaderId, gameVersion: string): Promise<LoaderVersionInfo[]>
  }
  java: {
    detect(): Promise<JavaInstall[]>
    pickExecutable(): Promise<string | null>
  }
  launch: {
    start(profileId: string): Promise<void>
    kill(): Promise<void>
    getState(): Promise<LaunchState>
    onState(cb: (state: LaunchState) => void): () => void
    onLog(cb: (line: string) => void): () => void
  }
  downloads: {
    list(): Promise<DownloadTask[]>
    cancel(id: string): Promise<void>
    retry(id: string): Promise<void>
    pause(id: string): Promise<void>
    resume(id: string): Promise<void>
    clearFinished(): Promise<void>
    onUpdate(cb: (tasks: DownloadTask[]) => void): () => void
  }
  system: {
    totalRamMb(): Promise<number>
    openLogs(): Promise<void>
    clearCache(): Promise<void>
    openExternal(url: string): void
    pickImage(): Promise<string | null>
    appVersion(): Promise<string>
    platform: string
  }
  news: {
    launcher(): Promise<NewsItem[]>
  }
  modpacks: {
    /** Creates the profile from the pack manifest and installs its contents. */
    install(input: ModpackInstallInput): Promise<Profile>
    onProgress(cb: (p: ModpackProgress) => void): () => void
  }
  curseforge: {
    /** Requires an API key in Settings; rejects with a friendly error otherwise. */
    searchPacks(params: CurseForgeSearchParams): Promise<CurseForgePack[]>
    install(input: CurseForgeInstallInput): Promise<Profile>
    /** Open a file picker for a CurseForge modpack .zip; null if cancelled. */
    pickZip(): Promise<string | null>
    installZip(input: CurseForgeZipInstallInput): Promise<Profile>
    hasApiKey(): Promise<boolean>
  }
  legal: {
    status(): Promise<LegalStatus>
    accept(): Promise<void>
  }
  hwid: {
    status(): Promise<HwidStatus>
    autofix(): Promise<HwidFixResult>
    onFixProgress(cb: (step: string) => void): () => void
    relaunch(): void
    exit(): void
  }
  updater: {
    /** Manual check; state events carry the outcome. */
    check(): Promise<void>
    /** User consented — start downloading the offered update. */
    download(): Promise<void>
    /** Quit and install the downloaded update now. */
    install(): void
    getState(): Promise<UpdaterState>
    onState(cb: (state: UpdaterState) => void): () => void
  }
  onNotification(cb: (n: NotificationPayload) => void): () => void
  onProfilesChanged(cb: () => void): () => void
  onAccountsChanged(cb: () => void): () => void
}

// Channel names (single source of truth)
export const CH = {
  winMinimize: 'win:minimize',
  winMaximize: 'win:maximize',
  winClose: 'win:close',
  winIsMaximized: 'win:isMaximized',
  winMaximizedChanged: 'win:maximizedChanged',

  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  settingsReset: 'settings:reset',

  accountsList: 'accounts:list',
  accountsGetActive: 'accounts:getActive',
  accountsSetActive: 'accounts:setActive',
  accountsAddOffline: 'accounts:addOffline',
  accountsLoginMs: 'accounts:loginMicrosoft',
  accountsRefresh: 'accounts:refresh',
  accountsRemove: 'accounts:remove',
  accountsChanged: 'accounts:changed',

  profilesList: 'profiles:list',
  profilesCreate: 'profiles:create',
  profilesUpdate: 'profiles:update',
  profilesDuplicate: 'profiles:duplicate',
  profilesRemove: 'profiles:remove',
  profilesOpenFolder: 'profiles:openFolder',
  profilesExport: 'profiles:export',
  profilesImport: 'profiles:import',
  profilesRepair: 'profiles:repair',
  profilesGetSelected: 'profiles:getSelected',
  profilesSetSelected: 'profiles:setSelected',
  profilesChanged: 'profiles:changed',

  contentList: 'content:list',
  contentToggle: 'content:toggle',
  contentRemove: 'content:remove',
  contentCheckUpdates: 'content:checkUpdates',
  contentUpdate: 'content:update',
  contentDependents: 'content:dependents',

  mrSearch: 'modrinth:search',
  mrProject: 'modrinth:project',
  mrVersions: 'modrinth:versions',
  mrInstall: 'modrinth:install',
  mrFeatured: 'modrinth:featured',

  versionsMc: 'versions:minecraft',
  versionsLoader: 'versions:loader',

  javaDetect: 'java:detect',
  javaPick: 'java:pick',

  launchStart: 'launch:start',
  launchKill: 'launch:kill',
  launchGetState: 'launch:getState',
  launchState: 'launch:state',
  launchLog: 'launch:log',

  dlList: 'downloads:list',
  dlCancel: 'downloads:cancel',
  dlRetry: 'downloads:retry',
  dlPause: 'downloads:pause',
  dlResume: 'downloads:resume',
  dlClearFinished: 'downloads:clearFinished',
  dlUpdate: 'downloads:update',

  sysTotalRam: 'system:totalRam',
  sysOpenLogs: 'system:openLogs',
  sysClearCache: 'system:clearCache',
  sysOpenExternal: 'system:openExternal',
  sysPickImage: 'system:pickImage',
  sysAppVersion: 'system:appVersion',

  newsLauncher: 'news:launcher',

  modpackInstall: 'modpacks:install',
  modpackProgress: 'modpacks:progress',

  cfSearch: 'curseforge:search',
  cfInstall: 'curseforge:install',
  cfPickZip: 'curseforge:pickZip',
  cfInstallZip: 'curseforge:installZip',
  cfHasKey: 'curseforge:hasKey',

  legalStatus: 'legal:status',
  legalAccept: 'legal:accept',

  hwidStatus: 'hwid:status',
  hwidAutofix: 'hwid:autofix',
  hwidFixProgress: 'hwid:fixProgress',
  appRelaunch: 'app:relaunch',
  appExit: 'app:exit',

  updaterCheck: 'updater:check',
  updaterDownload: 'updater:download',
  updaterInstall: 'updater:install',
  updaterGetState: 'updater:getState',
  updaterState: 'updater:state',

  notify: 'app:notify'
} as const
