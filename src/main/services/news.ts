import type { NewsItem } from '@shared/types'

/**
 * Launcher news & changelog. Shipped statically for now; swap the source for
 * a hosted JSON feed when one exists.
 */
const NEWS: NewsItem[] = [
  {
    title: 'Welcome to FvC Launcher 1.0',
    body: 'Isolated profiles, Modrinth mod browsing with automatic dependencies, Microsoft & offline accounts, and a launch pipeline that verifies everything before starting the game.',
    date: '2026-07-15',
    tag: 'Release'
  },
  {
    title: 'Modrinth integration',
    body: 'Search mods, resource packs and shader packs live from Modrinth. Installs place files into the right profile automatically and pull required dependencies.',
    date: '2026-07-15',
    tag: 'Feature'
  },
  {
    title: 'All major loaders supported',
    body: 'Fabric, Quilt, Forge and NeoForge are installed automatically per profile — pick a version in the wizard and press Play.',
    date: '2026-07-15',
    tag: 'Feature'
  }
]

export const newsService = {
  launcher(): NewsItem[] {
    return NEWS
  }
}
