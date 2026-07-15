import { useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, FileText, Play, ShieldCheck } from 'lucide-react'
import { Toggle } from '@/components/ui'
import { LegalViewer, type LegalDoc } from '@/components/LegalViewer'
import { useApp } from '@/store'

/**
 * Mandatory first-launch dialog: the launcher is unusable until both the
 * EULA and the Privacy Policy have been accepted.
 */
export function FirstRunGate(): ReactNode {
  const acceptLegal = useApp((s) => s.acceptLegal)
  const [eulaOk, setEulaOk] = useState(false)
  const [privacyOk, setPrivacyOk] = useState(false)
  const [viewing, setViewing] = useState<LegalDoc | null>(null)
  const [busy, setBusy] = useState(false)

  const canContinue = eulaOk && privacyOk && !busy

  return (
    <div
      className="modal-backdrop"
      style={{ zIndex: 350, background: 'rgba(8, 10, 13, 0.85)' }}
    >
      <motion.div
        className="modal"
        style={{ maxWidth: 560 }}
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="modal-body" style={{ padding: '30px 30px 24px', gap: 20 }}>
          <div className="stack" style={{ alignItems: 'center', gap: 12, textAlign: 'center' }}>
            <span
              style={{
                width: 58,
                height: 58,
                borderRadius: 16,
                background: 'linear-gradient(135deg, var(--accent), #7b5bff)',
                display: 'grid',
                placeItems: 'center',
                boxShadow: 'var(--glow)'
              }}
            >
              <Play size={26} fill="#081018" strokeWidth={0} />
            </span>
            <h1 style={{ fontSize: '1.45rem' }}>Welcome to FvC Launcher</h1>
            <p className="muted" style={{ fontSize: '0.9rem', lineHeight: 1.55, maxWidth: 420 }}>
              Before using FvC Launcher, please review and accept our End User License Agreement
              and Privacy Policy.
            </p>
          </div>

          <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
            <button className="btn btn-ghost" onClick={() => setViewing('privacy')}>
              <ShieldCheck size={15} /> Privacy Policy
            </button>
            <button className="btn btn-ghost" onClick={() => setViewing('eula')}>
              <FileText size={15} /> EULA
            </button>
          </div>

          <div className="stack" style={{ gap: 12 }}>
            <label className="row card" style={{ gap: 12, padding: '13px 16px', cursor: 'pointer' }}>
              <Toggle checked={eulaOk} onChange={setEulaOk} />
              <span style={{ fontSize: '0.86rem', lineHeight: 1.4 }}>
                I have read and agree to the <strong>End User License Agreement</strong>.
              </span>
            </label>
            <label className="row card" style={{ gap: 12, padding: '13px 16px', cursor: 'pointer' }}>
              <Toggle checked={privacyOk} onChange={setPrivacyOk} />
              <span style={{ fontSize: '0.86rem', lineHeight: 1.4 }}>
                I have read and agree to the <strong>Privacy Policy</strong>.
              </span>
            </label>
          </div>

          <button
            className="btn btn-primary"
            style={{ padding: '12px 20px', fontSize: '0.95rem' }}
            disabled={!canContinue}
            onClick={() => {
              setBusy(true)
              void acceptLegal()
            }}
          >
            {busy ? <span className="spinner" /> : <ArrowRight size={16} />}
            Continue
          </button>
        </div>
      </motion.div>

      <LegalViewer doc={viewing} onClose={() => setViewing(null)} />
    </div>
  )
}
