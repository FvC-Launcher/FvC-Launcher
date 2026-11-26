import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import AdmZip from 'adm-zip'
import { paths } from '../paths'

/**
 * Mojang ships Minecraft's native libraries (LWJGL: windowing, OpenGL,
 * OpenAL, …) for Linux x64 only. On Linux arm64 (Raspberry Pi and other ARM
 * boards) we fetch LWJGL's official arm64 builds of the exact versions the
 * game uses from Maven Central, and point LWJGL at them with
 * -Dorg.lwjgl.librarypath, which it checks before java.library.path and the
 * classpath.
 */
export const isLinuxArm64 = process.platform === 'linux' && process.arch === 'arm64'

const UA = { 'User-Agent': 'FvC-Launcher/1.0.0' }
const MAVEN = 'https://repo1.maven.org/maven2/org/lwjgl'

interface Rule {
  action: 'allow' | 'disallow'
  os?: { name?: string }
}
interface Library {
  name: string
  rules?: Rule[]
}

/** Mojang's library rules: no rules = allowed; otherwise the last matching rule wins. */
function allowedOnLinux(lib: Library): boolean {
  if (!lib.rules || lib.rules.length === 0) return true
  let allowed = false
  for (const rule of lib.rules) {
    if (!rule.os || !rule.os.name || rule.os.name === 'linux') allowed = rule.action === 'allow'
  }
  return allowed
}

async function vanillaVersionJson(mcVersion: string): Promise<{ libraries: Library[] }> {
  const local = join(paths.meta, 'versions', mcVersion, `${mcVersion}.json`)
  if (existsSync(local)) {
    try {
      return JSON.parse(readFileSync(local, 'utf8'))
    } catch {
      /* fall through to a fresh download */
    }
  }
  const manifestRes = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json', {
    headers: UA
  })
  if (!manifestRes.ok) throw new Error(`Mojang version manifest error ${manifestRes.status}`)
  const manifest = (await manifestRes.json()) as { versions: { id: string; url: string }[] }
  const entry = manifest.versions.find((v) => v.id === mcVersion)
  if (!entry) throw new Error(`Minecraft ${mcVersion} is not in Mojang's version list.`)
  const res = await fetch(entry.url, { headers: UA })
  if (!res.ok) throw new Error(`Mojang version JSON error ${res.status}`)
  return (await res.json()) as { libraries: Library[] }
}

/**
 * Versions to try for an artifact's arm64 natives, best match first:
 *  - the exact version;
 *  - for Mojang's own rebuilds ("3.4.3-mojang-2.15.0", the FreeType in 26.x)
 *    the stock release they are based on, whose Java classes are identical;
 *  - for LWJGL 3.1/3.2 (Minecraft 1.13–1.18), which had no Linux arm64 builds
 *    until 3.2.3, that release, which keeps the same native interface.
 */
function candidateVersions(version: string): string[] {
  const base = version.split('-')[0]
  const list = [version, base]
  if (/^3\.(1\.|2\.[0-2]$)/.test(base)) list.push('3.2.3')
  return [...new Set(list)]
}

async function fetchArm64Natives(
  artifact: string,
  version: string,
  log: (line: string) => void
): Promise<Response | null> {
  for (const v of candidateVersions(version)) {
    const res = await fetch(`${MAVEN}/${artifact}/${v}/${artifact}-${v}-natives-linux-arm64.jar`, { headers: UA })
    if (res.ok) {
      if (v !== version) log(`[FvC] Using arm64 natives from ${artifact} ${v} for ${version}.`)
      return res
    }
  }
  return null
}

/**
 * Makes sure arm64 LWJGL natives for `mcVersion` are on disk and returns the
 * JVM arguments that make the game use them.
 */
export async function prepareLinuxArm64Natives(mcVersion: string, log: (line: string) => void): Promise<string[]> {
  const json = await vanillaVersionJson(mcVersion)

  // org.lwjgl:<artifact>:<version> (the Java jars, not their natives classifiers)
  const artifacts = new Map<string, string>()
  for (const lib of json.libraries) {
    const parts = lib.name.split(':')
    if (parts[0] !== 'org.lwjgl' || parts.length !== 3 || !allowedOnLinux(lib)) continue
    artifacts.set(parts[1], parts[2])
  }
  const core = artifacts.get('lwjgl')
  if (!core) {
    // LWJGL 2 (group org.lwjgl.lwjgl) — Minecraft 1.12.2 and older.
    throw new Error(
      `Minecraft ${mcVersion} uses LWJGL 2, which has no ARM build. ` +
        'On Linux ARM (like a Raspberry Pi) Minecraft 1.13 and newer can be played.'
    )
  }

  const dir = join(paths.meta, 'natives-linux-arm64', mcVersion)
  const marker = join(dir, '.complete')
  if (existsSync(marker)) return [`-Dorg.lwjgl.librarypath=${dir}`]

  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  for (const [artifact, version] of artifacts) {
    const res = await fetchArm64Natives(artifact, version, log)
    if (!res) {
      if (artifact === 'lwjgl') {
        throw new Error(`No ARM build of LWJGL ${version} (needed by Minecraft ${mcVersion}) is available.`)
      }
      // Expected for lwjgl-vulkan: on Linux it uses the system's Vulkan loader.
      log(`[FvC] No arm64 natives for ${artifact} ${version}; skipping.`)
      continue
    }
    const zip = new AdmZip(Buffer.from(await res.arrayBuffer()))
    for (const entry of zip.getEntries()) {
      // 3.3+ nests them under linux/arm64/org/lwjgl/…; 3.2 keeps them at the root.
      if (entry.isDirectory || !entry.entryName.endsWith('.so')) continue
      writeFileSync(join(dir, basename(entry.entryName)), entry.getData())
    }
  }
  writeFileSync(marker, `${new Date().toISOString()}\n`)
  log(`[FvC] Prepared arm64 LWJGL ${core} natives in ${dir}`)
  return [`-Dorg.lwjgl.librarypath=${dir}`]
}

/**
 * The Raspberry Pi's GPU driver reports OpenGL 3.1, below the 3.2+ Minecraft
 * asks for, yet runs the game fine when Mesa reports 3.3. Only applied on a
 * Pi, and never over a value the user set.
 */
export function raspberryPiGlEnv(): Record<string, string> {
  try {
    const model = readFileSync('/proc/device-tree/model', 'utf8')
    if (!model.includes('Raspberry Pi')) return {}
  } catch {
    return {}
  }
  const env: Record<string, string> = {}
  if (!process.env['MESA_GL_VERSION_OVERRIDE']) env['MESA_GL_VERSION_OVERRIDE'] = '3.3'
  if (!process.env['MESA_GLSL_VERSION_OVERRIDE']) env['MESA_GLSL_VERSION_OVERRIDE'] = '330'
  return env
}
