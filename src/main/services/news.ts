import { existsSync, readFileSync, writeFileSync } from 'fs'
import { paths } from '../paths'
import type { NewsItem } from '@shared/types'

/**
 * Announcements are published by editing Announcement.json in the launcher's
 * GitHub repo, so news can go out without a launcher release.
 */
const FEED_URL = 'https://raw.githubusercontent.com/FvC-Launcher/FvC-Launcher/main/Announcement.json'
const UA = 'FvC-Launcher (github.com/fvc-launcher)'
const CACHE_TTL = 5 * 60_000

let memo: { at: number; items: NewsItem[] } | null = null
let inFlight: Promise<NewsItem[]> | null = null

/** The last feed that loaded, so news still shows offline or while GitHub is down. */
function cacheFile(): string {
  return paths.file('announcements.json')
}

/** Keeps only well-formed entries; a typo in one announcement shouldn't hide the rest. */
function parse(raw: unknown): NewsItem[] {
  if (!Array.isArray(raw)) throw new Error('Announcement feed is not a list.')
  const items: NewsItem[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    const id = typeof e.id === 'number' ? e.id : Number(e.id)
    const title = typeof e.title === 'string' ? e.title.trim() : ''
    const message = typeof e.message === 'string' ? e.message.trim() : ''
    const date = typeof e.date === 'string' ? e.date : ''
    if (!Number.isFinite(id) || !title || Number.isNaN(Date.parse(date))) continue
    items.push({ id, title, body: message, date, important: e.important === true })
  }
  return items.sort((a, b) => b.id - a.id)
}

function readCache(): NewsItem[] {
  try {
    return existsSync(cacheFile()) ? parse(JSON.parse(readFileSync(cacheFile(), 'utf-8'))) : []
  } catch {
    return []
  }
}

async function fetchFeed(): Promise<NewsItem[]> {
  const res = await fetch(FEED_URL, {
    headers: { 'User-Agent': UA, 'Cache-Control': 'no-cache' },
    signal: AbortSignal.timeout(10_000)
  })
  if (!res.ok) throw new Error(`Announcement feed returned ${res.status}`)
  const raw: unknown = await res.json()
  const items = parse(raw)
  writeFileSync(cacheFile(), JSON.stringify(raw, null, 2), 'utf-8')
  return items
}

export const newsService = {
  async launcher(): Promise<NewsItem[]> {
    if (memo && Date.now() - memo.at < CACHE_TTL) return memo.items
    inFlight ??= fetchFeed()
      .then((items) => {
        memo = { at: Date.now(), items }
        return items
      })
      .catch((err) => {
        console.warn('[news] could not load announcements:', err)
        return memo?.items ?? readCache()
      })
      .finally(() => {
        inFlight = null
      })
    return inFlight
  }
}
