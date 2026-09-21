import { BrowserWindow, app } from 'electron'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { Client } from 'minecraft-launcher-core'
import { paths } from '../paths'
import { broadcast, notify } from '../broadcast'
import { CH } from '@shared/ipc'
import { profilesService } from './profiles'
import { packUpdaterService } from './packUpdater'
import { accountsService } from './accounts'
import { settingsService } from './settings'
import { downloadsService } from './downloads'
import { javaService, requiredJavaMajor } from './java'
import { skinsService } from './skins'
import { randomUUID } from 'crypto'
import type { LaunchPhase, LaunchState, LoaderId, Profile } from '@shared/types'

const sessions = new Map<string, LaunchState>()
const PREPARING: LaunchPhase[] = ['verifying', 'java', 'loader', 'assets', 'launching']
const FINISHED: LaunchPhase[] = ['idle', 'stopped', 'error']

function publish(): void {
  broadcast(CH.launchState, [...sessions.values()])
}

function update(sessionId: string, patch: Partial<LaunchState>): void {
  const current = sessions.get(sessionId)
  if (!current) return
  sessions.set(sessionId, { ...current, ...patch })
  publish()
}

/** Finished sessions linger briefly so the UI can show "Game closed" / the error. */
function removeLater(sessionId: string, ms: number): void {
  setTimeout(() => {
    if (sessions.delete(sessionId)) publish()
  }, ms)
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
  getState(): LaunchState[] {
    return [...sessions.values()]
  },

  async start(profileId: string): Promise<void> {
    const settings = settingsService.get()
    const refuse = (body: string): never => {
      notify({ type: 'warning', title: 'Can’t launch yet', body })
      throw new Error(body)
    }
    const active = [...sessions.values()].filter((s) => !FINISHED.includes(s.phase))
    if (!settings.developerMode && active.length > 0) {
      refuse('A game is already running. Enable developer mode in Settings → Advanced to run several at once.')
    }
    // Two launches preparing at once would download into the same shared files.
    if (active.some((s) => PREPARING.includes(s.phase))) {
      refuse('Another game is still starting. Launch the next one once its window is open.')
    }
    let profile = profilesService.get(profileId)
    if (!profile) throw new Error('Profile not found.')
    const accountId = accountsService.getActiveId()
    if (!accountId) throw new Error('Add an account before launching.')

    const sessionId = randomUUID()
    sessions.set(sessionId, {
      sessionId,
      profileId,
      accountName: accountsService.list().find((a) => a.id === accountId)?.username,
      phase: 'verifying',
      detail: 'Preparing account…',
      progress: -1
    })
    publish()
    const setState = (patch: Partial<LaunchState>): void => update(sessionId, patch)
    const phase = (): LaunchPhase | undefined => sessions.get(sessionId)?.phase
    let gameStartedAt = 0

    try {
      // 0. GitHub-backed packs must match the latest release before playing.
      if (profile.packSource) {
        profile = await packUpdaterService.ensureUpToDate(profile, (detail) =>
          setState({ phase: 'verifying', detail })
        )
      }

      // 1. Account / session
      setState({ phase: 'verifying', detail: 'Preparing account…' })
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
      try {
        await skinsService.prepareInstance(profile, accountId)
      } catch (err) {
        log(`[FvC] Could not set up FvC Skins: ${err instanceof Error ? err.message : String(err)}`)
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

      client.on('debug', (line: string) => settings.debugLogging && log(`[debug] ${line}`))
      client.on('data', (line: string) => {
        log(line)
        // First game output = the window is up.
        if (phase() === 'launching') {
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
        if (phase() === 'assets') {
          setState({ detail: `Downloading ${e.type}…`, progress })
        }
      })
      client.on('close', (code: number) => {
        tracker.finish(true)
        if (gameStartedAt > 0) {
          profilesService.addPlaySession(profileId, (Date.now() - gameStartedAt) / 1000)
          gameStartedAt = 0
        }
        const win = BrowserWindow.getAllWindows()[0]
        if (win && !win.isDestroyed() && win.isMinimized()) win.restore()
        if (code !== 0 && phase() !== 'stopped') {
          setState({ phase: 'error', detail: `Game exited with code ${code}`, error: `Exit code ${code}` })
          notify({ type: 'error', title: 'Game crashed', body: `Minecraft exited with code ${code}.` })
        } else {
          setState({ phase: 'stopped', detail: 'Game closed', progress: -1 })
        }
        removeLater(sessionId, 1500)
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
      const message = err instanceof Error ? err.message : String(err)
      setState({ phase: 'error', detail: message, error: message })
      notify({ type: 'error', title: 'Launch failed', body: message })
      removeLater(sessionId, 4000)
      throw err
    }
  },

  kill(sessionId?: string): void {
    const targets = sessionId
      ? [sessions.get(sessionId)].filter((s): s is LaunchState => !!s)
      : [...sessions.values()]
    for (const session of targets) {
      if (!session.pid || FINISHED.includes(session.phase)) continue
      update(session.sessionId, { phase: 'stopped', detail: 'Stopping game…' })
      try {
        process.kill(session.pid)
      } catch {
        /* already dead */
      }
    }
  }
}
