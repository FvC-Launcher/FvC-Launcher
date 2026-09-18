import { resolve, sep } from 'path'

/** Resolve a manifest-relative path, refusing anything escaping the base dir. */
export function safeInstancePath(instanceDir: string, relPath: string): string {
  const target = resolve(instanceDir, relPath)
  if (!target.startsWith(resolve(instanceDir) + sep)) {
    throw new Error(`Pack contains an unsafe file path: ${relPath}`)
  }
  return target
}

/** Normalise a GitHub repo link or "owner/repo" to "owner/repo". Returns null if invalid. */
export function normalizeGithubRepo(input: string): string | null {
  let s = input.trim()
  s = s.replace(/^(https?:\/\/)?(www\.)?github\.com\//i, '')
  s = s.replace(/\.git$/i, '').replace(/\/+$/, '')
  const m = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(s)
  return m ? `${m[1]}/${m[2]}` : null
}
