import { execFile } from 'child_process'
import { promisify } from 'util'
import { dialog, BrowserWindow } from 'electron'
import { existsSync, mkdirSync, readdirSync, rmSync } from 'fs'
import { join } from 'path'
import AdmZip from 'adm-zip'
import { paths } from '../paths'
import { downloadsService } from './downloads'
import type { JavaArch, JavaInstall } from '@shared/types'

const execFileAsync = promisify(execFile)
const isWindows = process.platform === 'win32'
const javaBin = isWindows ? 'java.exe' : 'java'
const isWindowsArm = isWindows && process.arch === 'arm64'

/** The architecture this launcher build runs as (the x64 build on an ARM PC is emulated and says x64). */
const hostArch: JavaArch = process.arch === 'arm64' ? 'arm64' : process.arch === 'ia32' ? 'x86' : 'x64'

function normaliseArch(osArch: string): JavaArch | undefined {
  const a = osArch.trim().toLowerCase()
  if (a === 'amd64' || a === 'x86_64' || a === 'x64') return 'x64'
  if (a === 'aarch64' || a === 'arm64') return 'arm64'
  if (a === 'x86' || a === 'i386' || a === 'i686') return 'x86'
  return undefined
}

async function probe(javaPath: string, source: JavaInstall['source']): Promise<JavaInstall | null> {
  try {
    // -XshowSettings:properties (Java 7+) adds os.arch to the -version output.
    const { stderr, stdout } = await execFileAsync(javaPath, ['-XshowSettings:properties', '-version'], {
      timeout: 10_000,
      maxBuffer: 4 * 1024 * 1024
    })
    const output = `${stderr}\n${stdout}`
    const match = /version "([^"]+)"/.exec(output)
    if (!match) return null
    const version = match[1]
    // "1.8.0_392" → 8, "17.0.9" → 17, "21" → 21
    const major = version.startsWith('1.') ? Number(version.split('.')[1]) : Number(version.split('.')[0])
    if (!Number.isFinite(major)) return null
    const archMatch = /^\s*os\.arch\s*=\s*(\S+)/m.exec(output)
    const arch = archMatch ? normaliseArch(archMatch[1]) : undefined
    return { path: javaPath, version, majorVersion: major, arch, source }
  } catch {
    return null
  }
}

function candidatePaths(): string[] {
  const found: string[] = []
  if (isWindows) {
    for (const root of [
      process.env['ProgramFiles'],
      process.env['ProgramFiles(x86)'],
      process.env['LOCALAPPDATA'] && join(process.env['LOCALAPPDATA'], 'Programs')
    ]) {
      if (!root) continue
      for (const vendor of ['Java', 'Eclipse Adoptium', 'Microsoft', 'Zulu', 'Amazon Corretto']) {
        const dir = join(root, vendor)
        if (!existsSync(dir)) continue
        try {
          for (const entry of readdirSync(dir)) {
            const bin = join(dir, entry, 'bin', javaBin)
            if (existsSync(bin)) found.push(bin)
          }
        } catch {
          /* permission issues — skip */
        }
      }
    }
  } else {
    for (const dir of ['/usr/lib/jvm', '/usr/java', '/opt/java']) {
      if (!existsSync(dir)) continue
      try {
        for (const entry of readdirSync(dir)) {
          const bin = join(dir, entry, 'bin', javaBin)
          if (existsSync(bin)) found.push(bin)
        }
      } catch {
        /* skip */
      }
    }
  }
  // Managed runtimes downloaded by the launcher.
  if (existsSync(paths.javaDir)) {
    for (const entry of readdirSync(paths.javaDir)) {
      for (const bin of [
        join(paths.javaDir, entry, 'bin', javaBin),
        // Adoptium archives nest a single top folder.
        ...safeSubdirs(join(paths.javaDir, entry)).map((s) => join(s, 'bin', javaBin))
      ]) {
        if (existsSync(bin)) found.push(bin)
      }
    }
  }
  return [...new Set(found)]
}

function safeSubdirs(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => join(dir, d.name))
  } catch {
    return []
  }
}

/**
 * Required Java major for a given Minecraft version (applies to every patch
 * release within a minor version):
 *   1.0–1.16.x → 8 · 1.17.x → 16 · 1.18–1.20.4 → 17 · 1.20.5–1.21.x → 21
 *   Year-based scheme (26.1, 26.1.2, …) → 25
 * Week snapshots: "25w…" and older → 21, "26w…" and newer → 25.
 */
export function requiredJavaMajor(mcVersion: string): number {
  const release = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(mcVersion)
  if (release) {
    const major = Number(release[1])
    const minor = Number(release[2])
    const patch = Number(release[3] ?? 0)
    if (major >= 2) return 25 // year-based versions (26.x and beyond)
    // Classic 1.x line
    if (minor >= 21 || (minor === 20 && patch >= 5)) return 21
    if (minor >= 18) return 17
    if (minor === 17) return 16
    return 8
  }
  const snapshot = /^(\d{2})w/.exec(mcVersion)
  if (snapshot) return Number(snapshot[1]) >= 26 ? 25 : 21
  return 25 // unknown modern id — newest runtime is the safest bet
}

/**
 * Whether a Minecraft version ships Windows arm64 natives. Mojang added them
 * with LWJGL 3.3.1 in 1.19 (first snapshot 22w11a); older versions only have
 * x86/x64 natives.
 */
function hasWindowsArm64Natives(mcVersion: string): boolean {
  const release = /^(\d+)\.(\d+)/.exec(mcVersion)
  if (release) return Number(release[1]) >= 2 || Number(release[2]) >= 19
  const snapshot = /^(\d{2})w(\d{2})/.exec(mcVersion)
  if (snapshot) {
    const year = Number(snapshot[1])
    return year > 22 || (year === 22 && Number(snapshot[2]) >= 11)
  }
  return true // unknown modern id
}

/**
 * Which Java architecture a Minecraft version should run on. Java has to
 * match the game's native libraries, so on Windows on ARM versions older than
 * 1.19 run on x64 Java (through Windows' x64 emulation). Everywhere else it is
 * the launcher's own architecture.
 */
export function javaArchFor(mcVersion: string): JavaArch {
  if (isWindowsArm && !hasWindowsArm64Natives(mcVersion)) return 'x64'
  return hostArch
}

/** A runtime with no detectable os.arch is assumed to match the launcher. */
const archOf = (j: JavaInstall): JavaArch => j.arch ?? hostArch

interface RuntimePackage {
  url: string
  name: string
  label: string
}

async function adoptiumPackage(major: number, arch: JavaArch): Promise<RuntimePackage | null> {
  const os = isWindows ? 'windows' : 'linux'
  const apiArch = arch === 'arm64' ? 'aarch64' : arch
  const listUrl =
    `https://api.adoptium.net/v3/assets/latest/${major}/hotspot` +
    `?os=${os}&architecture=${apiArch}&image_type=jre`
  const res = await fetch(listUrl, { headers: { 'User-Agent': 'FvC-Launcher/1.0.0' } })
  if (!res.ok) throw new Error(`Adoptium API error ${res.status}`)
  const assets = (await res.json()) as {
    binary: { package: { link: string; name: string } }
  }[]
  const pkg = assets[0]?.binary?.package
  if (!pkg) return null
  return { url: pkg.link, name: pkg.name, label: `Java ${major} (Adoptium JRE)` }
}

/**
 * Microsoft's OpenJDK covers Windows arm64 for 17, 21 and 25; Adoptium only
 * ships an arm64 Windows JRE for 21.
 */
async function microsoftArm64Package(major: number): Promise<RuntimePackage | null> {
  const name = `microsoft-jdk-${major}-windows-aarch64.zip`
  const url = `https://aka.ms/download-jdk/${name}`
  const res = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': 'FvC-Launcher/1.0.0' } })
  if (!res.ok) return null
  return { url, name, label: `Java ${major} (Microsoft OpenJDK)` }
}

export const javaService = {
  async detect(): Promise<JavaInstall[]> {
    const results = await Promise.all([
      probe(javaBin, 'system'), // PATH
      ...candidatePaths().map((p) =>
        probe(p, p.startsWith(paths.javaDir) ? 'managed' : 'system')
      )
    ])
    const seen = new Set<string>()
    return results
      .filter((r): r is JavaInstall => r !== null)
      .filter((r) => {
        const key = `${r.version}|${r.path}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .sort((a, b) => b.majorVersion - a.majorVersion)
  },

  async pickExecutable(): Promise<string | null> {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      title: 'Select Java executable',
      properties: ['openFile'],
      filters: isWindows ? [{ name: 'Java', extensions: ['exe'] }] : []
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const install = await probe(result.filePaths[0], 'custom')
    if (!install) throw new Error('That file does not look like a working Java executable.')
    return result.filePaths[0]
  },

  /**
   * Find (or download) a Java runtime with the given major, built for `arch`
   * (defaults to the launcher's own architecture).
   */
  async ensureMajor(major: number, arch: JavaArch = hostArch): Promise<string> {
    const installed = (await this.detect()).filter((j) => archOf(j) === arch)
    const match = installed.find((j) => j.majorVersion === major)
    if (match) return match.path
    // Any newer major also works for vanilla, but mods can be picky — prefer exact.
    const compatible = installed.find((j) => j.majorVersion > major)

    try {
      return await this.downloadRuntime(major, arch)
    } catch (err) {
      if (compatible) return compatible.path
      // Windows on ARM also runs x64 Java (emulated, slower), which beats not launching.
      if (isWindowsArm && arch === 'arm64') {
        try {
          return await this.ensureMajor(major, 'x64')
        } catch {
          /* report the original arm64 failure below */
        }
      }
      throw new Error(
        `Java ${major} is required but could not be found or downloaded: ` +
          (err instanceof Error ? err.message : String(err))
      )
    }
  },

  async downloadRuntime(major: number, arch: JavaArch): Promise<string> {
    let pkg = await adoptiumPackage(major, arch)
    if (!pkg && isWindows && arch === 'arm64') pkg = await microsoftArm64Package(major)
    if (!pkg) {
      throw new Error(`No Java ${major} build available for ${isWindows ? 'windows' : 'linux'}/${arch}.`)
    }

    const archivePath = join(paths.cache, pkg.name)
    await downloadsService.enqueue({
      url: pkg.url,
      destination: archivePath,
      kind: 'java',
      label: pkg.label,
      detail: pkg.name
    })

    // x64 keeps the original folder name, so runtimes downloaded before are reused.
    const targetDir = join(paths.javaDir, arch === 'x64' ? `jre-${major}` : `jre-${major}-${arch}`)
    rmSync(targetDir, { recursive: true, force: true })
    mkdirSync(targetDir, { recursive: true })

    if (pkg.name.endsWith('.zip')) {
      new AdmZip(archivePath).extractAllTo(targetDir, true)
    } else {
      // .tar.gz on Linux — use the system tar.
      await execFileAsync('tar', ['-xzf', archivePath, '-C', targetDir], { timeout: 120_000 })
    }
    rmSync(archivePath, { force: true })

    for (const sub of safeSubdirs(targetDir)) {
      const bin = join(sub, 'bin', javaBin)
      if (existsSync(bin)) return bin
    }
    const direct = join(targetDir, 'bin', javaBin)
    if (existsSync(direct)) return direct
    throw new Error('Downloaded Java archive had an unexpected layout.')
  }
}
