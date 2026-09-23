import { useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft, Check, Info, User, UserPlus, WifiOff, X } from 'lucide-react'
import { Button, Input, Modal } from '@/components/ui'
import { useApp } from '@/store'
import type { Account } from '@shared/types'

/** Microsoft OAuth trigger shared by the add-account flow and re-login buttons. */
export function useMicrosoftLogin(onSuccess?: (account: Account) => void): {
  busy: boolean
  login: () => Promise<void>
} {
  const pushNotification = useApp((s) => s.pushNotification)
  const refreshAccounts = useApp((s) => s.refreshAccounts)
  const [busy, setBusy] = useState(false)

  const login = async (): Promise<void> => {
    setBusy(true)
    try {
      const account = await window.fvc.accounts.loginMicrosoft()
      pushNotification({ type: 'success', title: `Signed in as ${account.username}` })
      onSuccess?.(account)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // Closing the login window is a cancel, not an error.
      if (!/cancel|gui\.closed/i.test(message)) {
        pushNotification({ type: 'error', title: 'Sign-in failed', body: message })
      }
    } finally {
      setBusy(false)
      await refreshAccounts()
    }
  }

  return { busy, login }
}

const NAME_MAX = 16

/** The four-square Microsoft mark, drawn in CSS so no image asset is needed. */
function MicrosoftLogo(): ReactNode {
  return (
    <span className="aa-ms-logo" aria-hidden>
      <span />
      <span />
      <span />
      <span />
    </span>
  )
}

/**
 * "Add account" chooser: Microsoft OAuth or offline username. Used from the
 * Accounts page and from Play when no account exists yet.
 */
export function AddAccountModal({
  open,
  onClose,
  onAdded
}: {
  open: boolean
  onClose: () => void
  onAdded?: (account: Account) => void
}): ReactNode {
  const pushNotification = useApp((s) => s.pushNotification)
  const accounts = useApp((s) => s.accounts)
  const [stage, setStage] = useState<'choose' | 'offline'>('choose')
  const [offlineName, setOfflineName] = useState('')
  const [adding, setAdding] = useState(false)
  const { busy: msBusy, login } = useMicrosoftLogin((account) => {
    onClose()
    onAdded?.(account)
  })

  useEffect(() => {
    if (open) {
      setStage('choose')
      setOfflineName('')
      setAdding(false)
    }
  }, [open])

  const name = offlineName.trim()
  const rules = [
    { ok: name.length >= 3 && name.length <= NAME_MAX, label: '3 to 16 characters' },
    { ok: name.length > 0 && /^[A-Za-z0-9_]+$/.test(name), label: 'Letters, numbers and _ only' },
    {
      ok: name.length > 0 && !accounts.some((a) => a.username.toLowerCase() === name.toLowerCase()),
      label: 'Not already added'
    }
  ]
  const valid = rules.every((r) => r.ok)

  const addOffline = async (): Promise<void> => {
    if (!valid || adding) return
    setAdding(true)
    try {
      const account = await window.fvc.accounts.addOffline(name)
      pushNotification({ type: 'success', title: `Added offline account ${account.username}` })
      onClose()
      onAdded?.(account)
    } catch (err) {
      pushNotification({
        type: 'error',
        title: 'Could not add account',
        body: err instanceof Error ? err.message : String(err)
      })
    } finally {
      setAdding(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !msBusy && onClose()}
      className="add-account"
      footer={
        stage === 'offline' ? (
          <>
            <Button icon={ArrowLeft} onClick={() => setStage('choose')}>
              Back
            </Button>
            <div style={{ flex: 1 }} />
            <Button
              variant="primary"
              icon={UserPlus}
              loading={adding}
              disabled={!valid}
              onClick={() => void addOffline()}
            >
              Add account
            </Button>
          </>
        ) : undefined
      }
    >
      <header className="aa-head">
        <div>
          <h2>{stage === 'choose' ? 'Add an account' : 'Create an offline account'}</h2>
          <p className="tiny">
            {stage === 'choose'
              ? 'Choose how you want to play. You can add as many accounts as you like and switch any time.'
              : 'Pick the name you’ll have in game. It’s stored only on this computer.'}
          </p>
        </div>
        <button className="wz-close" onClick={onClose} disabled={msBusy} aria-label="Close">
          <X size={18} />
        </button>
      </header>

      <div className="aa-body">
        {stage === 'choose' ? (
          <div className="aa-choices">
            <button className={`aa-choice ms ${msBusy ? 'busy' : ''}`} disabled={msBusy} onClick={() => void login()}>
              <span className="aa-choice-tag">Recommended</span>
              <span className="aa-choice-icon">{msBusy ? <span className="spinner" /> : <MicrosoftLogo />}</span>
              <span className="aa-choice-title">Microsoft account</span>
              <span className="aa-choice-desc">
                {msBusy
                  ? 'Finish signing in in the Microsoft window. Close it to cancel.'
                  : 'The official sign-in, for players who own Minecraft Java Edition.'}
              </span>
              <span className="aa-points">
                <span>
                  <Check size={13} /> Play on any server
                </span>
                <span>
                  <Check size={13} /> Your own skin and cape
                </span>
                <span>
                  <Check size={13} /> Stays signed in
                </span>
              </span>
              <span className="aa-choice-cta">{msBusy ? 'Waiting for sign-in…' : 'Sign in with Microsoft'}</span>
            </button>

            <button className="aa-choice" disabled={msBusy} onClick={() => setStage('offline')}>
              <span className="aa-choice-icon offline">
                <WifiOff size={22} />
              </span>
              <span className="aa-choice-title">Offline account</span>
              <span className="aa-choice-desc">Just a username, no sign-in. Nothing is sent to Microsoft.</span>
              <span className="aa-points">
                <span>
                  <Check size={13} /> Singleplayer and LAN worlds
                </span>
                <span>
                  <Check size={13} /> Offline-mode servers
                </span>
                <span>
                  <Check size={13} /> Custom skins with FvC Skins
                </span>
              </span>
              <span className="aa-choice-cta">Choose a username</span>
            </button>
          </div>
        ) : (
          <div className="aa-offline">
            <div className="aa-preview">
              <span className="aa-preview-avatar">
                <User size={26} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div className={`aa-preview-name ${name ? '' : 'placeholder'}`}>{name || 'Username'}</div>
                <span className="badge">
                  <WifiOff size={11} /> Offline
                </span>
              </div>
            </div>

            <div className="wz-field">
              <div className="aa-label-row">
                <span className="wz-label">Username</span>
                <span className={`tiny aa-count ${name.length > NAME_MAX ? 'over' : ''}`}>
                  {name.length}/{NAME_MAX}
                </span>
              </div>
              <Input
                autoFocus
                className="wz-name"
                placeholder="Steve"
                spellCheck={false}
                autoComplete="off"
                maxLength={NAME_MAX + 8}
                value={offlineName}
                onChange={(e) => setOfflineName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void addOffline()}
              />
              <ul className="aa-rules">
                {rules.map((rule) => (
                  <li key={rule.label} className={rule.ok ? 'ok' : name ? 'bad' : ''}>
                    <span className="aa-rule-dot">{rule.ok ? <Check size={10} strokeWidth={3} /> : name ? <X size={10} strokeWidth={3} /> : null}</span>
                    {rule.label}
                  </li>
                ))}
              </ul>
            </div>

            <div className="aa-note">
              <Info size={15} />
              <span>
                Offline accounts can’t join servers that check Microsoft accounts. On offline-mode servers, use
                the same name every time so you keep your inventory.
              </span>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
