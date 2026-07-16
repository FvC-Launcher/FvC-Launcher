// ---------------------------------------------------------------------------
// Shared domain types used by main, preload and renderer.
// ---------------------------------------------------------------------------

export type Page =
  | 'home'
  | 'play'
  | 'profiles'
  | 'mods'
  | 'downloads'
  | 'accounts'
  | 'settings'
  | 'about'

// ----------------------------------- Accounts ------------------------------

export type AccountType = 'microsoft' | 'offline'

export interface Account {
  id: string
  type: AccountType
  username: string
  uuid: string
  /** Only for microsoft accounts: ISO date when the MC token expires. */
  expiresAt?: string
  /** True when the stored session failed to refresh and needs re-login. */
  needsRelogin?: boolean
  addedAt: string
}

// ----------------------------------- Profiles ------------------------------

export type LoaderId = 'vanilla' | 'fabric' | 'forge' | 'neoforge' | 'quilt'

export interface Profile {
  id: string
  name: string
  icon: string // lucide icon name or 'img:<filename>' inside the profile dir
  backgroundImage?: string
  minecraftVersion: string
  loader: LoaderId
  loaderVersion?: string
  ramMb: number
  javaPath?: string // empty → managed/auto
  javaArgs?: string
  resolution?: { width: number; height: number }
  fullscreen?: boolean
  favorite: boolean
  createdAt: string
  lastPlayed?: string
  playTimeSeconds: number
}

export interface InstalledContent {
  /** file name inside mods/resourcepacks/shaderpacks */
  fileName: string
  enabled: boolean
  fileSize: number
  sha1?: string
  // Resolved metadata (from Modrinth lookup or jar metadata)
  name?: string
  version?: string
  modrinthProjectId?: string
  modrinthVersionId?: string
  iconUrl?: string
  author?: string
  /** newest matching modrinth version id if an update exists */
  updateVersionId?: string
  updateVersionNumber?: string
}

export type ContentKind = 'mod' | 'resourcepack' | 'shaderpack'

// ----------------------------------- Modrinth ------------------------------

export interface ModrinthSearchHit {
  project_id: string
  slug: string
  title: string
  description: string
  author: string
  icon_url: string | null
  downloads: number
  follows: number
  versions: string[]
  categories: string[]
  display_categories?: string[]
  latest_version: string
  date_modified: string
  project_type: string
  gallery?: string[]
}

export interface ModrinthSearchResult {
  hits: ModrinthSearchHit[]
  total_hits: number
  offset: number
  limit: number
}

export interface ModrinthProject {
  id: string
  slug: string
  title: string
  description: string
  body: string
  icon_url: string | null
  downloads: number
  followers: number
  categories: string[]
  game_versions: string[]
  loaders: string[]
  gallery: { url: string; title: string | null; description: string | null }[]
  license: { id: string; name: string } | null
  source_url: string | null
  issues_url: string | null
  wiki_url: string | null
  discord_url: string | null
  project_type: string
  team: string
  published: string
  updated: string
}

export interface ModrinthVersionFile {
  url: string
  filename: string
  primary: boolean
  size: number
  hashes: { sha1: string; sha512: string }
}

export interface ModrinthDependency {
  version_id: string | null
  project_id: string | null
  dependency_type: 'required' | 'optional' | 'incompatible' | 'embedded'
}

export interface ModrinthVersion {
  id: string
  project_id: string
  name: string
  version_number: string
  changelog: string
  game_versions: string[]
  loaders: string[]
  version_type: 'release' | 'beta' | 'alpha'
  files: ModrinthVersionFile[]
  dependencies: ModrinthDependency[]
  date_published: string
  downloads: number
}

// ----------------------------------- Downloads -----------------------------

export type DownloadKind =
  | 'minecraft'
  | 'java'
  | 'libraries'
  | 'assets'
  | 'mod'
  | 'resourcepack'
  | 'shaderpack'
  | 'loader'
  | 'other'

export type DownloadStatus =
  | 'queued'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface DownloadTask {
  id: string
  kind: DownloadKind
  label: string
  detail?: string
  url?: string
  status: DownloadStatus
  /** 0..1, -1 when indeterminate */
  progress: number
  receivedBytes: number
  totalBytes: number
  speedBps: number
  etaSeconds: number
  error?: string
  createdAt: number
}

// ----------------------------------- Settings ------------------------------

export interface AppSettings {
  language: string
  launchOnStartup: boolean
  checkLauncherUpdates: boolean
  afterLaunch: 'keep' | 'minimize' | 'close'
  // Minecraft defaults (profiles can override)
  defaultRamMb: number
  defaultJavaPath: string
  defaultJavaArgs: string
  defaultResolution: { width: number; height: number }
  defaultFullscreen: boolean
  gcPreset: 'default' | 'g1gc' | 'zgc'
  showConsoleOnLaunch: boolean
  /** When multiple accounts exist, ask which one to use on Play. */
  askAccountOnPlay: boolean
  /** auto = launcher picks/downloads the right Java per Minecraft version. */
  javaMode: 'auto' | 'manual'
  // Appearance
  accentColor: string
  blurIntensity: number
  animationSpeed: number
  cornerRadius: number
  compactMode: boolean
  backgroundImage: string
  backgroundOpacity: number
  // Downloads
  concurrentDownloads: number
  speedLimitMbps: number // 0 = unlimited
  autoUpdateMods: boolean
  /** Optional key from console.curseforge.com enabling CurseForge search. */
  curseforgeApiKey: string
  // Advanced
  debugLogging: boolean
  developerMode: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'en',
  launchOnStartup: false,
  checkLauncherUpdates: true,
  afterLaunch: 'minimize',
  defaultRamMb: 4096,
  defaultJavaPath: '',
  defaultJavaArgs: '',
  defaultResolution: { width: 1280, height: 720 },
  defaultFullscreen: false,
  gcPreset: 'g1gc',
  showConsoleOnLaunch: false,
  askAccountOnPlay: true,
  javaMode: 'auto',
  accentColor: '#3BCBFF',
  blurIntensity: 12,
  animationSpeed: 1,
  cornerRadius: 12,
  compactMode: false,
  backgroundImage: '',
  backgroundOpacity: 0.35,
  concurrentDownloads: 4,
  speedLimitMbps: 0,
  autoUpdateMods: false,
  curseforgeApiKey: '',
  debugLogging: false,
  developerMode: false
}

// ----------------------------------- Versions ------------------------------

export interface McVersion {
  id: string
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha'
  releaseTime: string
}

export interface LoaderVersionInfo {
  version: string
  stable: boolean
  recommended?: boolean
}

// ----------------------------------- Launch --------------------------------

export type LaunchPhase =
  | 'idle'
  | 'verifying'
  | 'java'
  | 'loader'
  | 'assets'
  | 'launching'
  | 'running'
  | 'stopped'
  | 'error'

export interface LaunchState {
  profileId: string | null
  phase: LaunchPhase
  detail: string
  progress: number // 0..1, -1 indeterminate
  pid?: number
  error?: string
}

// ----------------------------------- Misc ----------------------------------

export interface NotificationPayload {
  id?: string
  title: string
  body?: string
  type: 'info' | 'success' | 'error' | 'warning'
  durationMs?: number
}

export interface NewsItem {
  title: string
  body: string
  date: string
  tag: string
  url?: string
}

export interface JavaInstall {
  path: string
  version: string
  majorVersion: number
  source: 'system' | 'managed' | 'custom'
}

// ----------------------------------- Modpacks ------------------------------

export interface ModpackProgress {
  phase: 'preparing' | 'manifest' | 'files' | 'overrides' | 'verify' | 'done' | 'error'
  detail: string
  /** 0..1, -1 indeterminate */
  progress: number
}

/** A CurseForge modpack search hit, mapped to a launcher-friendly shape. */
export interface CurseForgePack {
  id: number
  name: string
  summary: string
  author: string
  logoUrl: string | null
  downloads: number
  dateModified: string
  gameVersions: string[]
  categories: string[]
  websiteUrl: string | null
}

// ----------------------------------- HWID ----------------------------------

export type HwidStatus = 'valid' | 'invalid'

export interface HwidFixResult {
  ok: boolean
  message: string
}

// ----------------------------------- Legal ---------------------------------

export interface LegalStatus {
  accepted: boolean
  eulaVersion: string
  privacyVersion: string
}

// ----------------------------------- Updater -------------------------------

export type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'dev'

export interface UpdaterState {
  status: UpdaterStatus
  /** Version offered/downloaded (e.g. "1.2.0"). */
  version?: string
  /** Release notes (markdown from the GitHub release body). */
  notes?: string
  /** Download progress 0..100. */
  percent?: number
  /** Bytes per second while downloading. */
  speedBps?: number
  error?: string
}
