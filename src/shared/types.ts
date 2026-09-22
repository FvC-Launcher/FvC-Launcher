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
  | 'skin'
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

// ------------------------------------- Skins -------------------------------

/** Arm width of the player model: 4px (Steve) or 3px (Alex). */
export type SkinModel = 'classic' | 'slim'

/** A skin texture resolved by main, ready for the renderer to draw. */
export interface ResolvedSkin {
  /** The raw 64x64 (or legacy 64x32) skin texture as a data: URL. */
  dataUrl: string
  model: SkinModel
  /** How the user asked for it, or 'applied' for the account's current skin. */
  source: 'username' | 'url' | 'applied'
  /** Canonical Mojang name/uuid when resolved from a username. */
  username?: string
  uuid?: string
  /** Where the texture was actually downloaded from. */
  textureUrl: string
  /** True when the player has no custom skin and this is the Mojang default. */
  isDefault?: boolean
}

/** The skin an offline account wears in game through the bundled FvC Skins mod. */
export interface AppliedSkin {
  accountId: string
  dataUrl: string
  model: SkinModel
  appliedAt: string
  /** False while the skin server doesn't have it yet, so only you can see it. */
  shared: boolean
}

// ----------------------------------- Profiles ------------------------------

export type LoaderId = 'vanilla' | 'fabric' | 'forge' | 'neoforge' | 'quilt'

/** What an exported .fvcpack contains: only the mods folder, or the whole instance. */
export type ProfileExportMode = 'mods' | 'everything'

/**
 * Written into profile.json of GitHub-backed packs so other clients recognise
 * them and know where to fetch updates from (latest GitHub release).
 */
export interface GithubPackSource {
  type: 'fvc-github-pack'
  formatVersion: 1
  /** "owner/repo" */
  repo: string
  mode: ProfileExportMode
  /** Delete pack-managed files that are no longer in the new version. */
  removeOld: boolean
}

/** A community pack found through the `fvc-modpack` GitHub topic. */
export interface CommunityPack {
  /** "owner/repo" */
  repo: string
  name: string
  author: string
  description?: string
  /** Latest release tag. */
  version: string
  releaseId: number
  loader?: LoaderId
  minecraftVersion?: string
  stars: number
  updatedAt: string
  url: string
  sizeBytes: number
}

/** Options the author picks when exporting a GitHub-backed pack. */
export interface GithubExportOptions {
  repo: string
  removeOld: boolean
}

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
  /** Present when this profile auto-updates from a GitHub release. */
  packSource?: GithubPackSource & {
    /** GitHub release id the current files match (local only, stripped on export). */
    installedReleaseId?: number
    /** Release tag matching installedReleaseId, for display. */
    installedTag?: string
    /** Instance-relative paths the pack installed (local only, stripped on export). */
    managedFiles?: string[]
  }
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
  /** Theme preset id (see renderer themes.ts). */
  theme: string
  accentColor: string
  /** Second color of accent gradients (progress bar, play button). */
  accentColor2: string
  blurIntensity: number
  animationSpeed: number
  cornerRadius: number
  compactMode: boolean
  /** Root UI scale multiplier (0.85–1.2). */
  uiScale: number
  /** Collapse the sidebar to icons only. */
  sidebarIconsOnly: boolean
  notificationPosition: 'top-right' | 'bottom-right'
  backgroundImage: string
  backgroundOpacity: number
  modBrowser: ModBrowserPrefs
  // Downloads
  concurrentDownloads: number
  speedLimitMbps: number // 0 = unlimited
  autoUpdateMods: boolean
  /** Optional key from console.curseforge.com enabling CurseForge search. */
  curseforgeApiKey: string
  // Advanced
  debugLogging: boolean
  /** Also allows running several games at the same time. */
  developerMode: boolean
  /** Update to GitHub pre-releases too, whichever is newest. */
  alphaBuilds: boolean
}

export interface ModBrowserPrefs {
  view: 'list' | 'grid' | 'compact'
  sort: 'relevance' | 'downloads' | 'follows' | 'newest' | 'updated'
  pageSize: number
  /** Filter results to the target profile's Minecraft version and loader. */
  compatibleOnly: boolean
  hideInstalled: boolean
}

export const DEFAULT_MOD_BROWSER: ModBrowserPrefs = {
  view: 'list',
  sort: 'relevance',
  pageSize: 20,
  compatibleOnly: true,
  hideInstalled: false
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
  theme: 'fvc-dark',
  accentColor: '#3BCBFF',
  accentColor2: '#7B5BFF',
  blurIntensity: 12,
  animationSpeed: 1,
  cornerRadius: 12,
  compactMode: false,
  uiScale: 1,
  sidebarIconsOnly: false,
  notificationPosition: 'top-right',
  backgroundImage: '',
  backgroundOpacity: 0.35,
  modBrowser: DEFAULT_MOD_BROWSER,
  concurrentDownloads: 4,
  speedLimitMbps: 0,
  autoUpdateMods: false,
  curseforgeApiKey: '',
  debugLogging: false,
  developerMode: false,
  alphaBuilds: false
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

/** One game launch; several can run at once in developer mode. */
export interface LaunchState {
  sessionId: string
  profileId: string
  accountName?: string
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
  | 'manual'
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
  /** The offered version came from "Revert to latest release" (may be older). */
  toStable?: boolean
}
