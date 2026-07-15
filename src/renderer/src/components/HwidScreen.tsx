import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Check, LogOut, RotateCcw, Wrench, XCircle } from 'lucide-react'

/**
 * Full-screen recovery UI shown when the protected HWID record is missing,
 * corrupted or fails validation. Replaces the entire app until resolved.
 */
export function HwidScreen(): ReactNode {
  const [fixing, setFixing] = useState(false)
  const [steps, setSteps] = useState<string[]>([])
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => {
    return window.fvc.hwid.onFixProgress((step) => {
      setSteps((prev) => (prev[prev.length - 1] === step ? prev : [...prev, step]))
    })
  }, [])

  const autofix = async (): Promise<void> => {
    setFixing(true)
    setSteps([])
    setResult(null)
    try {
      const res = await window.fvc.hwid.autofix()
      setResult(res)
      if (res.ok) {
        setTimeout(() => window.fvc.hwid.relaunch(), 1200)
      }
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : String(err) })
    } finally {
      setFixing(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        display: 'grid',
        placeItems: 'center',
        background:
          'radial-gradient(1000px 500px at 50% -10%, rgba(220, 38, 38, 0.28), transparent), linear-gradient(180deg, #2a0b0e, #16060a)',
        padding: 40
      }}
    >
      {/* Draggable strip so the frameless window can still be moved. */}
      <div className="hwid-drag" />
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 18,
          maxWidth: 560,
          textAlign: 'center'
        }}
      >
        <XCircle size={88} strokeWidth={1.4} style={{ color: '#f87171', filter: 'drop-shadow(0 0 24px rgba(248,113,113,0.45))' }} />
        <h1 style={{ fontSize: '2rem', letterSpacing: '-0.02em' }}>Incorrect HWID</h1>
        <p style={{ color: 'rgba(255,255,255,0.75)', lineHeight: 1.6, fontSize: '0.95rem' }}>
          A problem was detected while validating your launcher installation.
          <br />
          This may have been caused by corrupted launcher data or a significant hardware change.
        </p>

        {(fixing || steps.length > 0) && (
          <div
            className="card"
            style={{
              width: '100%',
              padding: 18,
              background: 'rgba(0,0,0,0.35)',
              textAlign: 'left'
            }}
          >
            {steps.map((step, i) => {
              const isLast = i === steps.length - 1
              const running = fixing && isLast
              return (
                <div key={step} className="row" style={{ gap: 10, padding: '5px 0' }}>
                  {running ? (
                    <span className="spinner" style={{ width: 14, height: 14, color: '#f87171' }} />
                  ) : (
                    <Check size={14} style={{ color: 'var(--success)' }} />
                  )}
                  <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.85)' }}>{step}</span>
                </div>
              )
            })}
            {result && (
              <p
                style={{
                  marginTop: 10,
                  fontSize: '0.84rem',
                  lineHeight: 1.5,
                  color: result.ok ? 'var(--success)' : '#fca5a5'
                }}
              >
                {result.ok ? 'Repair successful — restarting the launcher…' : result.message}
              </p>
            )}
          </div>
        )}

        <div className="row" style={{ gap: 12, marginTop: 6 }}>
          <button
            className="btn btn-ghost"
            style={{ padding: '11px 22px' }}
            disabled={fixing}
            onClick={() => window.fvc.hwid.relaunch()}
          >
            <RotateCcw size={16} /> Reload
          </button>
          <button
            className="btn"
            style={{
              padding: '11px 22px',
              background: '#dc2626',
              color: '#fff'
            }}
            disabled={fixing}
            onClick={() => void autofix()}
          >
            {fixing ? <span className="spinner" /> : <Wrench size={16} />} Autofix
          </button>
          <button
            className="btn btn-ghost"
            style={{ padding: '11px 22px' }}
            disabled={fixing}
            onClick={() => window.fvc.hwid.exit()}
          >
            <LogOut size={16} /> Exit
          </button>
        </div>
      </motion.div>
    </div>
  )
}
