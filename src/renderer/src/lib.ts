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
import type { ContentKind, LaunchPhase, LoaderId } from '@shared/types'

/** A launch in one of these phases is still getting ready (no game window yet). */
export const PREPARING_PHASES: LaunchPhase[] = ['verifying', 'java', 'loader', 'assets', 'launching']

export { LOADER_LABELS } from '@shared/types'

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

export interface CategoryGroup {
  label: string
  items: string[]
}

/** Filterable Modrinth category slugs per content kind. */
export const CATEGORY_GROUPS: Record<ContentKind, CategoryGroup[]> = {
  mod: [
    {
      label: 'Categories',
      items: [
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
    }
  ],
  resourcepack: [
    {
      label: 'Style',
      items: ['combat', 'cursed', 'decoration', 'modded', 'realistic', 'simplistic', 'themed', 'tweaks', 'utility', 'vanilla-like']
    },
    {
      label: 'Features',
      items: ['audio', 'blocks', 'core-shaders', 'entities', 'environment', 'equipment', 'fonts', 'gui', 'items', 'locale', 'models']
    },
    {
      label: 'Resolution',
      items: ['8x-', '16x', '32x', '48x', '64x', '128x', '256x', '512x+']
    }
  ],
  shaderpack: [
    {
      label: 'Style',
      items: ['cartoon', 'cursed', 'fantasy', 'realistic', 'semi-realistic', 'vanilla-like']
    },
    {
      label: 'Features',
      items: ['atmosphere', 'bloom', 'colored-lighting', 'foliage', 'path-tracing', 'pbr', 'reflections', 'shadows']
    },
    {
      label: 'Performance',
      items: ['potato', 'low', 'medium', 'high', 'screenshot']
    },
    {
      label: 'Loader',
      items: ['iris', 'optifine', 'canvas', 'vanilla']
    }
  ]
}

const CATEGORY_LABELS: Record<string, string> = {
  pbr: 'PBR',
  gui: 'GUI',
  optifine: 'OptiFine',
  'vanilla-like': 'Vanilla-like',
  'semi-realistic': 'Semi-realistic',
  '8x-': '8x or lower'
}

export function titleCase(slug: string): string {
  if (CATEGORY_LABELS[slug]) return CATEGORY_LABELS[slug]
  return slug
    .split('-')
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(' ')
}
