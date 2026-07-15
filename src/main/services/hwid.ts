import { safeStorage } from 'electron'
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { cpus } from 'os'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { paths } from '../paths'
import { broadcast } from '../broadcast'
import { CH } from '@shared/ipc'
import type { HwidFixResult, HwidStatus } from '@shared/types'

const execFileAsync = promisify(execFile)

/**
 * Launcher-integrity HWID.
 *
 * Only stable, non-personal characteristics are used, and only their SHA-256
 * hashes are stored. The record is HMAC-signed (tamper evidence) and wrapped
 * with OS-level encryption (DPAPI / keyring) when available. Everything stays
 * local — see the Privacy Policy.
 */

interface HwidRecord {
  v: 1
  /** Random launcher identity, preserved across autofix repairs. */
  identity: string
  componentHashes: Record<ComponentName, string>
  hwid: string
  createdAt: string
}

type ComponentName = 'machineId' | 'cpu' | 'platform'

// Obfuscation-grade signing key: makes casual editing detectable, not a
// cryptographic guarantee against a determined local attacker (impossible
// for purely local integrity checks).
const SIGNING_KEY = 'fvc-launcher.hwid.v1:9d2f6c1a4e8b5073'

const FILE = () => paths.file('hwid.dat')

function sha256(data: string): string {
  return createHash('sha256').update(data, 'utf-8').digest('hex')
}

function sign(json: string): string {
  return createHmac('sha256', SIGNING_KEY).update(json, 'utf-8').digest('hex')
}

// ------------------------------------------------------------ hardware bits

async function readMachineId(): Promise<string> {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execFileAsync(
        'reg',
        ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'],
        { timeout: 10_000 }
      )
      const match = /MachineGuid\s+REG_SZ\s+(\S+)/.exec(stdout)
      if (match) return match[1]
    } else {
      for (const file of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
        if (existsSync(file)) {
          const id = readFileSync(file, 'utf-8').trim()
          if (id) return id
        }
      }
    }
  } catch {
    /* fall through */
  }
  return 'unknown-machine'
}

async function collectComponents(): Promise<Record<ComponentName, string>> {
  const machineId = await readMachineId()
  const cpu = cpus()[0]?.model ?? 'unknown-cpu'
  const platform = `${process.platform}-${process.arch}`
  return {
    machineId: sha256(`mid:${machineId}`),
    cpu: sha256(`cpu:${cpu}`),
    platform: sha256(`plt:${platform}`)
  }
}

function computeHwid(components: Record<ComponentName, string>): string {
  return sha256(`${components.machineId}|${components.cpu}|${components.platform}`)
}

// ------------------------------------------------------------ record I/O

function protect(record: HwidRecord): string {
  const json = JSON.stringify(record)
  const payload = JSON.stringify({ record: json, sig: sign(json) })
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(payload).toString('base64')
  }
  return 'plain:' + Buffer.from(payload, 'utf-8').toString('base64')
}

/** Returns the parsed record plus whether its signature checked out. */
function unprotect(stored: string): { record: HwidRecord; sigOk: boolean } | null {
  try {
    const payload = stored.startsWith('plain:')
      ? Buffer.from(stored.slice(6), 'base64').toString('utf-8')
      : safeStorage.decryptString(Buffer.from(stored, 'base64'))
    const { record: json, sig } = JSON.parse(payload) as { record: string; sig: string }
    const expected = sign(json)
    const sigOk =
      typeof sig === 'string' &&
      sig.length === expected.length &&
      timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))
    const record = JSON.parse(json) as HwidRecord
    if (record?.v !== 1 || !record.hwid || !record.componentHashes) return null
    return { record, sigOk }
  } catch {
    return null
  }
}

/**
 * Marks that a HWID record has been generated at least once. Lets us tell
 * "first launch of the HWID feature" (including upgrades from older launcher
 * versions — create silently) apart from "record was deleted" (invalid).
 */
const MARKER = () => paths.file('.hwid-init')

async function writeFresh(identity?: string, createdAt?: string): Promise<HwidRecord> {
  const componentHashes = await collectComponents()
  const record: HwidRecord = {
    v: 1,
    identity: identity ?? randomUUID(),
    componentHashes,
    hwid: computeHwid(componentHashes),
    createdAt: createdAt ?? new Date().toISOString()
  }
  writeFileSync(FILE(), protect(record), 'utf-8')
  writeFileSync(MARKER(), record.createdAt, 'utf-8')
  return record
}

// ------------------------------------------------------------ public API

let cachedStatus: Promise<HwidStatus> | null = null

async function computeStatus(): Promise<HwidStatus> {
  if (!existsSync(FILE())) {
    // No record yet: first launch (or upgrade from a pre-HWID version) —
    // generate silently. If the marker says one existed before, it was
    // deleted → that's a validation failure.
    if (existsSync(MARKER())) return 'invalid'
    await writeFresh()
    return 'valid'
  }

  const loaded = unprotect(readFileSync(FILE(), 'utf-8'))
  if (!loaded || !loaded.sigOk) return 'invalid'

  const current = await collectComponents()
  return computeHwid(current) === loaded.record.hwid ? 'valid' : 'invalid'
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export const hwidService = {
  /** Cached for the whole process lifetime; validation runs once per start. */
  status(): Promise<HwidStatus> {
    if (!cachedStatus) cachedStatus = computeStatus()
    return cachedStatus
  },

  async autofix(): Promise<HwidFixResult> {
    const step = (label: string): void => broadcast(CH.hwidFixProgress, label)

    step('Checking launcher installation…')
    await sleep(450)
    const raw = existsSync(FILE()) ? readFileSync(FILE(), 'utf-8') : null
    const loaded = raw ? unprotect(raw) : null

    step('Validating hardware…')
    await sleep(450)
    const current = await collectComponents()

    if (!loaded) {
      // Nothing readable to anchor continuity to.
      return {
        ok: false,
        message:
          'The protected HWID record is missing or unreadable, so automatic repair cannot ' +
          'confirm this is the original device. Manual support or re-registration may be required.'
      }
    }

    // Continuity score: the OS machine id is the strongest anchor.
    const prev = loaded.record.componentHashes
    let score = 0
    if (prev.machineId === current.machineId) score += 2
    if (prev.cpu === current.cpu) score += 1
    if (prev.platform === current.platform) score += 1

    if (score < 2) {
      return {
        ok: false,
        message:
          'This device differs significantly from the one this launcher installation was ' +
          'created on. Automatic repair could not safely confirm continuity — manual support ' +
          'or re-registration may be required.'
      }
    }

    step('Repairing protected HWID record…')
    await sleep(500)
    await writeFresh(loaded.record.identity, loaded.record.createdAt)

    step('Final verification…')
    await sleep(400)
    cachedStatus = null
    const status = await this.status()
    if (status !== 'valid') {
      return { ok: false, message: 'Repair completed but verification still fails.' }
    }

    step('Done')
    await sleep(300)
    return { ok: true, message: 'Launcher installation repaired.' }
  }
}
