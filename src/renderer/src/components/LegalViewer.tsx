import { useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Copy, Search, X } from 'lucide-react'
import { escapeRegExp, renderMarkdown } from '@/markdown'
import { EULA_TEXT, PRIVACY_TEXT } from '@shared/legal'

export type LegalDoc = 'eula' | 'privacy'

const DOCS: Record<LegalDoc, { title: string; text: string }> = {
  eula: { title: 'End User License Agreement', text: EULA_TEXT },
  privacy: { title: 'Privacy Policy', text: PRIVACY_TEXT }
}

/**
 * Scrollable document viewer with search and copy. Rendered with a higher
 * z-index than regular modals so it can stack above the first-run dialog.
 */
export function LegalViewer({
  doc,
  onClose
}: {
  doc: LegalDoc | null
  onClose: () => void
}): ReactNode {
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState(false)

  const content = doc ? DOCS[doc] : null

  const body = useMemo(() => {
    if (!content) return ''
    if (!query.trim()) return renderMarkdown(content.text)
    // Search mode: show only matching lines with highlighted terms.
    const term = query.trim()
    const regex = new RegExp(escapeRegExp(term), 'gi')
    const lines = content.text
      .split('\n')
      .filter((line) => regex.test(line))
      .map((line) => {
        const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        return `<p>${escaped.replace(
          new RegExp(escapeRegExp(term), 'gi'),
          (m) => `<mark style="background:rgba(var(--accent-rgb),0.35);color:var(--text);border-radius:3px;padding:0 2px">${m}</mark>`
        )}</p>`
      })
    return lines.length > 0
      ? lines.join('')
      : `<p style="color:var(--text-3)">No matches for "${term}".</p>`
  }, [content, query])

  const copy = async (): Promise<void> => {
    if (!content) return
    await navigator.clipboard.writeText(content.text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  // Portal to <body> so it centers against the viewport even when opened from
  // inside a page (e.g. the About page) whose animation forms a containing block.
  return createPortal(
    <AnimatePresence>
      {doc && content && (
        <motion.div
          className="modal-backdrop"
          style={{ zIndex: 400 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            className="modal wide"
            style={{ maxWidth: 780, height: 'calc(100vh - 120px)' }}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="modal-header">
              <h2>{content.title}</h2>
              <button className="btn btn-subtle btn-icon" onClick={onClose} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <div className="row" style={{ padding: '12px 22px 0', gap: 10 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search
                  size={15}
                  style={{
                    position: 'absolute',
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-3)'
                  }}
                />
                <input
                  className="input"
                  placeholder="Search in document…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  style={{ paddingLeft: 36 }}
                />
              </div>
              <button className="btn btn-ghost" onClick={() => void copy()}>
                {copied ? <Check size={15} style={{ color: 'var(--success)' }} /> : <Copy size={15} />}
                {copied ? 'Copied' : 'Copy text'}
              </button>
            </div>
            <div className="modal-body" style={{ flex: 1 }}>
              <div className="md-body" dangerouslySetInnerHTML={{ __html: body }} />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
