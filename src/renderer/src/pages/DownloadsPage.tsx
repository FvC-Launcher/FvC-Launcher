import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import {
  CheckCircle2,
  Coffee,
  Download,
  FileBox,
  Image,
  Package,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
  XCircle
} from 'lucide-react'
import { Button, EmptyState, Progress } from '@/components/ui'
import { formatBytes, useApp } from '@/store'
import type { DownloadKind, DownloadTask } from '@shared/types'

const KIND_ICONS: Record<DownloadKind, typeof Package> = {
  minecraft: FileBox,
  java: Coffee,
  libraries: FileBox,
  assets: FileBox,
  mod: Package,
  resourcepack: Image,
  shaderpack: Sparkles,
  loader: FileBox,
  other: Download
}

function eta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  if (seconds < 60) return `${Math.ceil(seconds)}s left`
  return `${Math.ceil(seconds / 60)}m left`
}

function TaskRow({ task }: { task: DownloadTask }): ReactNode {
  const Icon = KIND_ICONS[task.kind] ?? Download
  const active = task.status === 'downloading'

  return (
    <motion.div layout className="card mod-row" style={{ alignItems: 'center' }}>
      <span className="mod-icon" style={{ width: 44, height: 44 }}>
        {task.status === 'completed' ? (
          <CheckCircle2 size={19} style={{ color: 'var(--success)' }} />
        ) : task.status === 'failed' || task.status === 'cancelled' ? (
          <XCircle size={19} style={{ color: 'var(--error)' }} />
        ) : (
          <Icon size={19} />
        )}
      </span>
      <div className="mod-meta">
        <div className="mod-title" style={{ fontSize: '0.9rem' }}>
          {task.label}
          {task.detail && <span className="author">{task.detail}</span>}
        </div>
        {active && (
          <div style={{ marginTop: 8 }}>
            <Progress value={task.progress} />
          </div>
        )}
        <div className="tiny" style={{ marginTop: active ? 6 : 3 }}>
          {task.status === 'downloading' && (
            <>
              {task.totalBytes > 0
                ? `${formatBytes(task.receivedBytes)} / ${formatBytes(task.totalBytes)}`
                : formatBytes(task.receivedBytes)}
              {task.speedBps > 0 && ` · ${formatBytes(task.speedBps)}/s`}
              {task.etaSeconds > 0 && ` · ${eta(task.etaSeconds)}`}
            </>
          )}
          {task.status === 'completed' && `Completed · ${formatBytes(task.totalBytes || task.receivedBytes)}`}
          {task.status === 'failed' && (task.error ?? 'Failed')}
          {task.status === 'queued' && 'Queued'}
          {task.status === 'paused' && 'Paused'}
          {task.status === 'cancelled' && 'Cancelled'}
        </div>
      </div>
      <div className="row" style={{ gap: 6 }}>
        {task.status === 'downloading' && (
          <Button variant="subtle" icon={Pause} onClick={() => void window.fvc.downloads.pause(task.id)} aria-label="Pause" />
        )}
        {task.status === 'paused' && (
          <Button variant="subtle" icon={Play} onClick={() => void window.fvc.downloads.resume(task.id)} aria-label="Resume" />
        )}
        {(task.status === 'failed' || task.status === 'cancelled') && task.url && (
          <Button variant="subtle" icon={RotateCcw} onClick={() => void window.fvc.downloads.retry(task.id)} aria-label="Retry" />
        )}
        {(task.status === 'downloading' || task.status === 'queued' || task.status === 'paused') && (
          <Button variant="subtle" icon={X} onClick={() => void window.fvc.downloads.cancel(task.id)} aria-label="Cancel" />
        )}
      </div>
    </motion.div>
  )
}

export function DownloadsPage(): ReactNode {
  const downloads = useApp((s) => s.downloads)
  const active = downloads.filter((d) => ['downloading', 'queued', 'paused'].includes(d.status))
  const finished = downloads.filter((d) => !['downloading', 'queued', 'paused'].includes(d.status))

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Downloads</h1>
          <div className="subtitle">Everything the launcher fetches: game files, Java, mods and packs.</div>
        </div>
        {finished.length > 0 && (
          <Button icon={Trash2} onClick={() => void window.fvc.downloads.clearFinished()}>
            Clear finished
          </Button>
        )}
      </div>

      {downloads.length === 0 ? (
        <EmptyState
          icon={Download}
          title="No downloads yet"
          hint="Install a mod or launch a profile and progress will show up here."
        />
      ) : (
        <div className="stack" style={{ gap: 18 }}>
          {active.length > 0 && (
            <section className="stack" style={{ gap: 10 }}>
              <h2>Active</h2>
              {active.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </section>
          )}
          {finished.length > 0 && (
            <section className="stack" style={{ gap: 10 }}>
              <h2>History</h2>
              {finished.slice(0, 40).map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </section>
          )}
        </div>
      )}
    </>
  )
}
