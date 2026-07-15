import { BrowserWindow, app } from 'electron'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { Client } from 'minecraft-launcher-core'
import { paths } from '../paths'
import { broadcast, notify } from '../broadcast'
import { CH } from '@shared/ipc'
import { profilesService } from './profiles'
import { accountsService } from './accounts'
import { settingsService } from './settings'
import { downloadsService } from './downloads'
import { javaService, requiredJavaMajor } from './java'
import type { LaunchState, LoaderId, Profile } from '@shared/types'

let state: LaunchState = {
  profileId: null,
  phase: 'idle',
  detail: '',
  progress: -1
}
let activeClient: Client | null = null
let gameStartedAt = 0

function setState(patch: Partial<LaunchState>): void {
  state = { ...state, ...patch }
  broadcast(CH.launchState, state)
}

function log(line: string): void {
  broadcast(CH.launchLog, line)
}

const GC_ARGS: Record<string, string[]> = {
  default: [],
  g1gc: [
    '-XX:+UseG1GC',
    '-XX:+ParallelRefProcEnabled',
    '-XX:MaxGCPauseMillis=200',
    '-XX:+UnlockExperimentalVMOptions',
    '-XX:G1NewSizePercent=30',
    '-XX:G1MaxNewSizePercent=40',
    '-XX:G1HeapRegionSize=8M'
  ],
  zgc: ['-XX:+UseZGC', '-XX:+AlwaysPreTouch']
}

/** Install Fabric/Quilt by writing their launch profile JSON into the shared versions dir. */
async function installFabricLike(profile: Profile): Promise<string> {
  const isQuilt = profile.loader === 'quilt'
  const meta = isQuilt ? 'https://meta.quiltmc.org/v3' : 'https://meta.fabricmc.net/v2'
  const name = `${isQuilt ? 'quilt-loader' : 'fabric-loader'}-${profile.loaderVersion}-${profile.minecraftVersion}`
  const versionDir = join(paths.meta, 'versions', name)
  const jsonPath = join(versionDir, `${name}.json`)
  if (existsSync(jsonPath)) return name

  const url = `${meta}/versions/loader/${encodeURIComponent(profile.minecraftVersion)}/${encodeURIComponent(profile.loaderVersion!)}/profile/json`
  const res = await fetch(url, { headers: { 'User-Agent': 'FvC-Launcher/1.0.0' } })
  if (!res.ok) {
    throw new Error(
      `Could not fetch ${isQuilt ? 'Quilt' : 'Fabric'} ${profile.loaderVersion} for ` +
        `Minecraft ${profile.minecraftVersion} (HTTP ${res.status}).`
    )
  }
  const json = (await res.json()) as { id?: string }
  json.id = name
  mkdirSync(versionDir, { recursive: true })
  writeFileSync(jsonPath, JSON.stringify(json, null, 2), 'utf-8')
  return name
}

/** Download the Forge/NeoForge installer jar; MCLC processes it at launch. */
async function downloadForgeInstaller(profile: Profile): Promise<string> {
  const isNeo = profile.loader === 'neoforge'
  const version = profile.loaderVersion!
  const url = isNeo
    ? `https://maven.neoforged.net/releases/net/neoforged/neoforge/${version}/neoforge-${version}-installer.jar`
    : `https://maven.minecraftforge.net/net/minecraftforge/forge/${profile.minecraftVersion}-${version}/forge-${profile.minecraftVersion}-${version}-installer.jar`
  const dest = join(
    paths.cache,
    'installers',
    isNeo ? `neoforge-${version}-installer.jar` : `forge-${profile.minecraftVersion}-${version}-installer.jar`
  )
  if (!existsSync(dest)) {
    await downloadsService.enqueue({
      url,
      destination: dest,
      kind: 'loader',
      label: `${isNeo ? 'NeoForge' : 'Forge'} ${version}`,
      detail: 'Installer'
    })
  }
  return dest
}

function loaderLabel(loader: LoaderId): string {
  return { vanilla: 'Vanilla', fabric: 'Fabric', forge: 'Forge', neoforge: 'NeoForge', quilt: 'Quilt' }[loader]
}

export const launchService = {
  getState(): LaunchState {
    return state
  },

  async start(profileId: string): Promise<void> {
    if (state.phase === 'running' || state.phase === 'launching') {
      throw new Error('A game is already running.')
    }
    const profile = profilesService.get(profileId)
    if (!profile) throw new Error('Profile not found.')
    const settings = settingsService.get()
    const accountId = accountsService.getActiveId()
    if (!accountId) throw new Error('Add an account before launching.')

    setState({ profileId, phase: 'verifying', detail: 'Preparing account…', progress: -1, error: undefined })

    try {
      // 1. Account / session
      const authorization = await accountsService.getLaunchAuth(accountId)

      // 2. Java — Auto picks (and downloads) the correct major for this MC
      // version; Manual uses the configured executable. A per-profile
      // executable is an explicit override and wins in both modes.
      setState({ phase: 'java', detail: 'Checking Java runtime…' })
      let javaPath: string
      if (profile.javaPath) {
        javaPath = profile.javaPath
      } else if (settings.javaMode === 'manual' && settings.defaultJavaPath) {
        javaPath = settings.defaultJavaPath
      } else if (settings.javaMode === 'manual') {
        throw new Error(
          'Java is set to Manual but no executable is configured. Pick one in Settings → Minecraft, or switch to Auto.'
        )
      } else {
        javaPath = await javaService.ensureMajor(requiredJavaMajor(profile.minecraftVersion))
      }

      // 3. Loader
      let customVersion: string | undefined
      let forgeInstaller: string | undefined
      if (profile.loader === 'fabric' || profile.loader === 'quilt') {
        setState({ phase: 'loader', detail: `Installing ${loaderLabel(profile.loader)}…` })
        customVersion = await installFabricLike(profile)
      } else if (profile.loader === 'forge' || profile.loader === 'neoforge') {
        setState({ phase: 'loader', detail: `Fetching ${loaderLabel(profile.loader)} installer…` })
        forgeInstaller = await downloadForgeInstaller(profile)
      }

      // 4. Launch via MCLC (it verifies/downloads vanilla files itself)
      setState({ phase: 'assets', detail: 'Verifying game files…', progress: -1 })
      const tracker = downloadsService.track({
        kind: 'minecraft',
        label: `Minecraft ${profile.minecraftVersion}`,
        detail: profile.name
      })

      const ramMb = profile.ramMb || settings.defaultRamMb
      const resolution = profile.resolution ?? settings.defaultResolution
      const fullscreen = profile.fullscreen ?? settings.defaultFullscreen
      const javaArgs = [
        ...GC_ARGS[settings.gcPreset],
        ...(settings.defaultJavaArgs ? settings.defaultJavaArgs.split(/\s+/).filter(Boolean) : []),
        ...(profile.javaArgs ? profile.javaArgs.split(/\s+/).filter(Boolean) : [])
      ]

      const client = new Client()
      activeClient = client

      client.on('debug', (line: string) => settings.debugLogging && log(`[debug] ${line}`))
      client.on('data', (line: string) => {
        log(line)
        // First game output = the window is up.
        if (state.phase === 'launching') {
          gameStartedAt = Date.now()
          setState({ phase: 'running', detail: 'Game running', progress: -1 })
          tracker.finish(true)
          const behavior = settingsService.get().afterLaunch
          const win = BrowserWindow.getAllWindows()[0]
          if (behavior === 'minimize') win?.minimize()
          else if (behavior === 'close') app.quit()
        }
      })
      client.on('progress', (e: { type: string; task: number; total: number }) => {
        const progress = e.total > 0 ? e.task / e.total : -1
        tracker.update(progress, `${e.type}`)
        if (state.phase === 'assets') {
          setState({ detail: `Downloading ${e.type}…`, progress })
        }
      })
      client.on('close', (code: number) => {
        activeClient = null
        tracker.finish(true)
        if (gameStartedAt > 0) {
          profilesService.addPlaySession(profileId, (Date.now() - gameStartedAt) / 1000)
          gameStartedAt = 0
        }
        const win = BrowserWindow.getAllWindows()[0]
        if (win && !win.isDestroyed() && win.isMinimized()) win.restore()
        if (code !== 0 && state.phase !== 'stopped') {
          setState({ phase: 'error', detail: `Game exited with code ${code}`, error: `Exit code ${code}` })
          notify({ type: 'error', title: 'Game crashed', body: `Minecraft exited with code ${code}.` })
        } else {
          setState({ phase: 'stopped', detail: 'Game closed', progress: -1 })
        }
        setTimeout(() => state.phase !== 'running' && setState({ phase: 'idle', detail: '' }), 1500)
      })

      const launched = await client.launch({
        authorization: authorization as never,
        root: paths.meta,
        version: {
          number: profile.minecraftVersion,
          type: 'release',
          ...(customVersion ? { custom: customVersion } : {})
        },
        ...(forgeInstaller ? { forge: forgeInstaller } : {}),
        javaPath,
        memory: { max: `${ramMb}M`, min: `${Math.min(1024, ramMb)}M` },
        window: { width: resolution.width, height: resolution.height, fullscreen },
        customArgs: javaArgs,
        overrides: {
          gameDirectory: paths.instance(profileId),
          detached: true,
          maxSockets: Math.max(2, settings.concurrentDownloads)
        }
      })

      if (!launched) {
        throw new Error('Failed to start the Java process. Check the selected Java runtime.')
      }
      setState({ phase: 'launching', detail: 'Starting Minecraft…', progress: -1, pid: launched.pid })
      profilesService.update(profileId, { lastPlayed: new Date().toISOString() })
    } catch (err) {
      activeClient = null
      const message = err instanceof Error ? err.message : String(err)
      setState({ phase: 'error', detail: message, error: message })
      notify({ type: 'error', title: 'Launch failed', body: message })
      setTimeout(() => state.phase === 'error' && setState({ phase: 'idle', detail: '' }), 4000)
      throw err
    }
  },

  kill(): void {
    if (state.pid) {
      setState({ phase: 'stopped', detail: 'Stopping game…' })
      try {
        process.kill(state.pid)
      } catch {
        /* already dead */
      }
    }
    activeClient = null
  }
}
