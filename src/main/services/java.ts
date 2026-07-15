import { execFile } from 'child_process'
import { promisify } from 'util'
import { dialog, BrowserWindow } from 'electron'
import { existsSync, mkdirSync, readdirSync, rmSync } from 'fs'
import { join } from 'path'
import AdmZip from 'adm-zip'
import { paths } from '../paths'
import { downloadsService } from './downloads'
import type { JavaInstall } from '@shared/types'

const execFileAsync = promisify(execFile)
const isWindows = process.platform === 'win32'
const javaBin = isWindows ? 'java.exe' : 'java'

async function probe(javaPath: string, source: JavaInstall['source']): Promise<JavaInstall | null> {
  try {
    const { stderr, stdout } = await execFileAsync(javaPath, ['-version'], { timeout: 10_000 })
    const output = stderr || stdout
    const match = /version "([^"]+)"/.exec(output)
    if (!match) return null
    const version = match[1]
    // "1.8.0_392" → 8, "17.0.9" → 17, "21" → 21
    const major = version.startsWith('1.') ? Number(version.split('.')[1]) : Number(version.split('.')[0])
    if (!Number.isFinite(major)) return null
    return { path: javaPath, version, majorVersion: major, source }
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

  /** Find (or download from Adoptium) a Java runtime with the given major. */
  async ensureMajor(major: number): Promise<string> {
    const installed = await this.detect()
    const match = installed.find((j) => j.majorVersion === major)
    if (match) return match.path
    // Any newer major also works for vanilla, but mods can be picky — prefer exact.
    const compatible = installed.find((j) => j.majorVersion > major)

    try {
      return await this.downloadAdoptium(major)
    } catch (err) {
      if (compatible) return compatible.path
      throw new Error(
        `Java ${major} is required but could not be found or downloaded: ` +
          (err instanceof Error ? err.message : String(err))
      )
    }
  },

  async downloadAdoptium(major: number): Promise<string> {
    const os = isWindows ? 'windows' : 'linux'
    const arch = process.arch === 'arm64' ? 'aarch64' : 'x64'
    const listUrl =
      `https://api.adoptium.net/v3/assets/latest/${major}/hotspot` +
      `?os=${os}&architecture=${arch}&image_type=jre`
    const res = await fetch(listUrl, { headers: { 'User-Agent': 'FvC-Launcher/1.0.0' } })
    if (!res.ok) throw new Error(`Adoptium API error ${res.status}`)
    const assets = (await res.json()) as {
      binary: { package: { link: string; name: string } }
    }[]
    const pkg = assets[0]?.binary?.package
    if (!pkg) throw new Error(`No Adoptium JRE ${major} build available for ${os}/${arch}.`)

    const archivePath = join(paths.cache, pkg.name)
    await downloadsService.enqueue({
      url: pkg.link,
      destination: archivePath,
      kind: 'java',
      label: `Java ${major} (Adoptium JRE)`,
      detail: pkg.name
    })

    const targetDir = join(paths.javaDir, `jre-${major}`)
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
