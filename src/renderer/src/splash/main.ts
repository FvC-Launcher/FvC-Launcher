import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import './splash.css'
import { themeById } from '@/themes'
import type { SplashState } from '@shared/types'

// Startup update window (see src/main/splash.ts). Plain DOM, no React, so it
// paints as fast as possible.

// Match the launcher's look; the main process passes the theme in the URL.
const params = new URLSearchParams(location.search)
const root = document.documentElement
for (const [key, value] of Object.entries(themeById(params.get('theme') ?? '').vars)) {
  root.style.setProperty(key, value)
}
const accent = params.get('accent')
const accent2 = params.get('accent2')
if (accent) root.style.setProperty('--accent', accent)
if (accent2) root.style.setProperty('--accent-2', accent2)

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T
const splash = document.querySelector<HTMLElement>('.splash')!
const status = el('status')
const detail = el('detail')
const progress = el('progress')
const bar = el('bar')
const actions = el('actions')
const retry = el<HTMLButtonElement>('retry')
const skip = el<HTMLButtonElement>('continue')

function render(state: SplashState): void {
  status.textContent = state.status
  detail.textContent = state.detail ?? ''
  detail.title = state.detail ?? ''

  const failed = state.phase === 'failed'
  splash.classList.toggle('busy', !failed)
  actions.hidden = !failed
  retry.disabled = skip.disabled = false

  progress.hidden = state.phase !== 'downloading' && state.phase !== 'installing'
  const indeterminate = state.percent == null
  progress.classList.toggle('indeterminate', indeterminate)
  bar.style.width = indeterminate ? '' : `${Math.min(100, state.percent ?? 0)}%`
}

// Disable both until the next state arrives so a double click can't queue a second choice.
retry.addEventListener('click', () => {
  retry.disabled = skip.disabled = true
  window.fvcSplash.retry()
})
skip.addEventListener('click', () => {
  retry.disabled = skip.disabled = true
  window.fvcSplash.skip()
})

window.fvcSplash.onState(render)
void window.fvcSplash.getState().then(render)
