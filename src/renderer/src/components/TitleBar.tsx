import { useEffect, useState, type ReactNode } from 'react'
import { Copy, Minus, Square, X } from 'lucide-react'
import logo from '@/assets/icon.png'

export function TitleBar(): ReactNode {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    void window.fvc.window.isMaximized().then(setMaximized)
    return window.fvc.window.onMaximizedChange(setMaximized)
  }, [])

  return (
    <header className="titlebar">
      <div className="brand">
        <img className="logo" src={logo} alt="" />
        FvC Launcher
      </div>
      <div className="win-controls">
        <button onClick={() => window.fvc.window.minimize()} aria-label="Minimize">
          <Minus size={16} />
        </button>
        <button
          onClick={() => window.fvc.window.maximize()}
          aria-label={maximized ? 'Restore' : 'Maximize'}
        >
          {maximized ? <Copy size={13} style={{ transform: 'scaleX(-1)' }} /> : <Square size={13} />}
        </button>
        <button className="close" onClick={() => window.fvc.window.close()} aria-label="Close">
          <X size={16} />
        </button>
      </div>
    </header>
  )
}
