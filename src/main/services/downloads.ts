import { createWriteStream, mkdirSync, renameSync, rmSync } from 'fs'
import { dirname } from 'path'
import { randomUUID } from 'crypto'
import { broadcast } from '../broadcast'
import { CH } from '@shared/ipc'
import { settingsService } from './settings'
import type { DownloadKind, DownloadStatus, DownloadTask } from '@shared/types'

interface InternalTask extends DownloadTask {
  destination?: string
  abort?: AbortController
  resolve?: () => void
  reject?: (err: Error) => void
}

const tasks = new Map<string, InternalTask>()
let active = 0
let notifyTimer: NodeJS.Timeout | null = null

function emit(): void {
  // Coalesce high-frequency progress updates into ~10 fps broadcasts.
  if (notifyTimer) return
  notifyTimer = setTimeout(() => {
    notifyTimer = null
    broadcast(CH.dlUpdate, downloadsService.list())
  }, 100)
}

function nextQueued(): InternalTask | undefined {
  return [...tasks.values()].find((t) => t.status === 'queued')
}

function pump(): void {
  const max = Math.max(1, settingsService.get().concurrentDownloads)
  while (active < max) {
    const task = nextQueued()
    if (!task) break
    void run(task)
  }
}

async function run(task: InternalTask): Promise<void> {
  active++
  task.status = 'downloading'
  task.abort = new AbortController()
  emit()

  const tmpPath = task.destination! + '.part'
  try {
    const response = await fetch(task.url!, {
      signal: task.abort.signal,
      headers: { 'User-Agent': 'FvC-Launcher/1.0.0 (github.com/fvc-launcher)' }
    })
    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`)
    }
    task.totalBytes = Number(response.headers.get('content-length') ?? 0)
    mkdirSync(dirname(task.destination!), { recursive: true })
    const out = createWriteStream(tmpPath)

    const reader = response.body.getReader()
    let lastTick = Date.now()
    let bytesSinceTick = 0
    const speedLimit = settingsService.get().speedLimitMbps * 125_000 // MB/s → bytes/s

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!out.write(value)) {
        await new Promise<void>((res) => out.once('drain', res))
      }
      task.receivedBytes += value.byteLength
      bytesSinceTick += value.byteLength

      const now = Date.now()
      const elapsed = now - lastTick
      if (elapsed >= 500) {
        task.speedBps = (bytesSinceTick / elapsed) * 1000
        task.etaSeconds =
          task.totalBytes > 0 && task.speedBps > 0
            ? (task.totalBytes - task.receivedBytes) / task.speedBps
            : 0
        lastTick = now
        bytesSinceTick = 0
      }
      task.progress = task.totalBytes > 0 ? task.receivedBytes / task.totalBytes : -1
      emit()

      // Crude token-bucket style speed limiting.
      if (speedLimit > 0 && task.speedBps > speedLimit) {
        await new Promise((res) => setTimeout(res, 100))
      }
    }

    await new Promise<void>((res, rej) => out.end((err?: Error) => (err ? rej(err) : res())))
    renameSync(tmpPath, task.destination!)
    task.status = 'completed'
    task.progress = 1
    task.speedBps = 0
    task.etaSeconds = 0
    task.resolve?.()
  } catch (err) {
    rmSync(tmpPath, { force: true })
    // pause() can flip the status while the fetch above is awaiting.
    const status = task.status as DownloadStatus
    if (status === 'paused') {
      // Paused: keep partial state; will restart from scratch on resume.
      task.receivedBytes = 0
      task.progress = 0
    } else if ((err as Error).name === 'AbortError') {
      task.status = 'cancelled'
      task.reject?.(new Error('Download cancelled'))
    } else {
      task.status = 'failed'
      task.error = err instanceof Error ? err.message : String(err)
      task.reject?.(new Error(task.error))
    }
  } finally {
    active--
    emit()
    pump()
  }
}

export const downloadsService = {
  list(): DownloadTask[] {
    return [...tasks.values()]
      .map(({ abort: _a, resolve: _r, reject: _j, destination: _d, ...pub }) => pub)
      .sort((a, b) => b.createdAt - a.createdAt)
  },

  /** Queue a file download; resolves when the file is fully written. */
  enqueue(opts: {
    url: string
    destination: string
    kind: DownloadKind
    label: string
    detail?: string
  }): Promise<void> {
    const task: InternalTask = {
      id: randomUUID(),
      kind: opts.kind,
      label: opts.label,
      detail: opts.detail,
      url: opts.url,
      destination: opts.destination,
      status: 'queued',
      progress: 0,
      receivedBytes: 0,
      totalBytes: 0,
      speedBps: 0,
      etaSeconds: 0,
      createdAt: Date.now()
    }
    tasks.set(task.id, task)
    const promise = new Promise<void>((resolve, reject) => {
      task.resolve = resolve
      task.reject = reject
    })
    emit()
    pump()
    return promise
  },

  /**
   * Register an externally-driven task (e.g. MCLC asset verification) so it
   * shows up on the Downloads page. Returns updater/finish callbacks.
   */
  track(opts: { kind: DownloadKind; label: string; detail?: string }) {
    const task: InternalTask = {
      id: randomUUID(),
      kind: opts.kind,
      label: opts.label,
      detail: opts.detail,
      status: 'downloading',
      progress: -1,
      receivedBytes: 0,
      totalBytes: 0,
      speedBps: 0,
      etaSeconds: 0,
      createdAt: Date.now()
    }
    tasks.set(task.id, task)
    emit()
    return {
      update(progress: number, detail?: string) {
        task.progress = progress
        if (detail !== undefined) task.detail = detail
        emit()
      },
      finish(ok: boolean, error?: string) {
        task.status = ok ? 'completed' : 'failed'
        task.progress = ok ? 1 : task.progress
        task.error = error
        emit()
      }
    }
  },

  cancel(id: string): void {
    const task = tasks.get(id)
    if (!task) return
    if (task.status === 'queued' || task.status === 'paused') {
      task.status = 'cancelled'
      task.reject?.(new Error('Download cancelled'))
      emit()
    } else if (task.status === 'downloading') {
      task.abort?.abort()
    }
  },

  pause(id: string): void {
    const task = tasks.get(id)
    if (!task) return
    if (task.status === 'downloading') {
      task.status = 'paused'
      task.abort?.abort()
    } else if (task.status === 'queued') {
      task.status = 'paused'
      emit()
    }
  },

  resume(id: string): void {
    const task = tasks.get(id)
    if (task?.status === 'paused') {
      task.status = 'queued'
      emit()
      pump()
    }
  },

  retry(id: string): void {
    const task = tasks.get(id)
    if (task && (task.status === 'failed' || task.status === 'cancelled') && task.url) {
      task.status = 'queued'
      task.error = undefined
      task.receivedBytes = 0
      task.progress = 0
      emit()
      pump()
    }
  },

  clearFinished(): void {
    for (const [id, task] of tasks) {
      if (['completed', 'failed', 'cancelled'].includes(task.status)) tasks.delete(id)
    }
    emit()
  }
}
