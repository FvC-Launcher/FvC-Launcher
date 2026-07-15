import { Component, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Catches render crashes so a broken page shows a recovery card instead of a
 * black window. Keyed by page in App.tsx, so navigating also resets it.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error): void {
    console.error('[ui] page crashed:', error)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="empty-state" style={{ paddingTop: 120 }}>
        <AlertTriangle style={{ color: 'var(--warning)' }} />
        <div>
          <h3 style={{ color: 'var(--text)' }}>Something went wrong on this page</h3>
          <p style={{ fontSize: '0.84rem', marginTop: 6, maxWidth: 420, lineHeight: 1.5 }}>
            {this.state.error.message}
          </p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn btn-primary" onClick={() => this.setState({ error: null })}>
            <RotateCcw size={15} /> Try again
          </button>
          <button className="btn btn-ghost" onClick={() => window.location.reload()}>
            Reload launcher
          </button>
        </div>
      </div>
    )
  }
}
