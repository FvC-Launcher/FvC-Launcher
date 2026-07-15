import {
  Anvil,
  Axe,
  Box,
  Compass,
  Flame,
  Gem,
  Ghost,
  Layers,
  Leaf,
  Mountain,
  Package,
  Pickaxe,
  Rocket,
  Shield,
  Sparkles,
  Sword,
  TreePine,
  Zap,
  type LucideIcon
} from 'lucide-react'
import type { ContentKind, LoaderId } from '@shared/types'

export const LOADER_LABELS: Record<LoaderId, string> = {
  vanilla: 'Vanilla',
  fabric: 'Fabric',
  forge: 'Forge',
  neoforge: 'NeoForge',
  quilt: 'Quilt'
}

export const LOADERS: LoaderId[] = ['vanilla', 'fabric', 'forge', 'neoforge', 'quilt']

/** Icons a profile can use, addressed by name. */
export const PROFILE_ICONS: Record<string, LucideIcon> = {
  Package,
  Box,
  Layers,
  Pickaxe,
  Sword,
  Axe,
  Shield,
  Compass,
  Rocket,
  Sparkles,
  Flame,
  Zap,
  Gem,
  Ghost,
  Leaf,
  TreePine,
  Mountain,
  Anvil
}

export function profileIcon(name: string): LucideIcon {
  return PROFILE_ICONS[name] ?? Package
}

export const KIND_LABELS: Record<ContentKind, { singular: string; plural: string }> = {
  mod: { singular: 'Mod', plural: 'Mods' },
  resourcepack: { singular: 'Resource Pack', plural: 'Resource Packs' },
  shaderpack: { singular: 'Shader Pack', plural: 'Shader Packs' }
}

/** Mod categories shown as filters (Modrinth category slugs). */
export const MOD_CATEGORIES = [
  'adventure',
  'cursed',
  'decoration',
  'economy',
  'equipment',
  'food',
  'game-mechanics',
  'library',
  'magic',
  'management',
  'minigame',
  'mobs',
  'optimization',
  'social',
  'storage',
  'technology',
  'transportation',
  'utility',
  'worldgen'
]

export function titleCase(slug: string): string {
  return slug
    .split('-')
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(' ')
}
