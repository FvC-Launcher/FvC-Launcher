import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowUpCircle, Clock, Download, RotateCcw } from 'lucide-react'
import { Button, Modal, Progress } from '@/components/ui'
import { formatBytes } from '@/store'
import { renderMarkdown } from '@/markdown'
import type { UpdaterState } from '@shared/types'

/**
 * Consent-first update popup. Appears when a new release is found; nothing
 * downloads or installs until the user says so.
 */
export function UpdateModal(): ReactNode {
  const [state, setState] = useState<UpdaterState>({ status: 'idle' })
  const [hidden, setHidden] = useState(false)
  const lastStatus = useRef<string>('idle')

  useEffect(() => {
    void window.fvc.updater.getState().then(setState)
    return window.fvc.updater.onState(setState)
  }, [])

  // Any status change (e.g. available → downloading) re-shows the dialog.
  useEffect(() => {
    if (state.status !== lastStatus.current) {
      lastStatus.current = state.status
      setHidden(false)
    }
  }, [state.status])

  const relevant = ['available', 'downloading', 'downloaded'].includes(state.status)
  const open = relevant && !hidden

  return (
    <Modal
      open={open}
      onClose={() => setHidden(true)}
      title={
        state.status === 'downloaded'
          ? 'Update ready to install'
          : `Update available — v${state.version ?? ''}`
      }
      footer={
        state.status === 'available' ? (
          <>
            <Button icon={Clock} onClick={() => setHidden(true)}>
              Later
            </Button>
            <Button variant="primary" icon={Download} onClick={() => void window.fvc.updater.download()}>
              Download update
            </Button>
          </>
        ) : state.status === 'downloaded' ? (
          <>
            <Button icon={Clock} onClick={() => setHidden(true)}>
              On next quit
            </Button>
            <Button variant="primary" icon={RotateCcw} onClick={() => window.fvc.updater.install()}>
              Restart now
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="modal-body" style={{ gap: 14 }}>
        <div className="row" style={{ gap: 10 }}>
          <ArrowUpCircle size={20} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <span className="muted" style={{ fontSize: '0.9rem', lineHeight: 1.5 }}>
            {state.status === 'available' &&
              `FvC Launcher ${state.version} is available. Download it now? The update installs when you restart.`}
            {state.status === 'downloading' && `Downloading FvC Launcher ${state.version}…`}
            {state.status === 'downloaded' &&
              `FvC Launcher ${state.version} has been downloaded. Restart now to apply it, or it will install automatically when you close the launcher.`}
          </span>
        </div>

        {state.status === 'downloading' && (
          <div className="stack" style={{ gap: 6 }}>
            <Progress value={(state.percent ?? 0) / 100} />
            <span className="tiny">
              {Math.round(state.percent ?? 0)}%
              {state.speedBps ? ` · ${formatBytes(state.speedBps)}/s` : ''}
            </span>
          </div>
        )}

        {state.notes && state.status !== 'downloading' && (
          <div
            className="card md-body"
            style={{ padding: 16, maxHeight: 240, overflowY: 'auto' }}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(state.notes) }}
          />
        )}
      </div>
    </Modal>
  )
}
