/**
 * Theme presets. Each theme is a set of CSS custom properties applied to the
 * document root; the user's accent colors are applied on top independently.
 */

export interface ThemeDef {
  id: string
  label: string
  hint?: string
  vars: Record<string, string>
}

const FVC_DARK: Record<string, string> = {
  '--bg': '#0f1115',
  '--bg-2': '#171a21',
  '--card': '#1c2029',
  '--card-hover': '#252b36',
  '--text': '#ffffff',
  '--text-2': '#aeb7c2',
  '--text-3': '#6d7683',
  '--line': 'rgba(255, 255, 255, 0.06)',
  '--line-strong': 'rgba(255, 255, 255, 0.16)',
  '--hover': 'rgba(255, 255, 255, 0.06)',
  '--hover-strong': 'rgba(255, 255, 255, 0.11)',
  '--control-bg': '#2b323e',
  '--scroll-thumb': '#2c3340',
  '--scroll-thumb-hover': '#3a4353',
  '--titlebar-bg': 'rgba(23, 26, 33, 0.65)',
  '--sidebar-bg': 'rgba(23, 26, 33, 0.55)',
  '--notification-bg': 'rgba(28, 32, 41, 0.92)',
  '--on-accent': '#06131a'
}

export const THEMES: ThemeDef[] = [
  {
    id: 'fvc-dark',
    label: 'FvC Dark',
    hint: 'default',
    vars: FVC_DARK
  },
  {
    id: 'amoled',
    label: 'AMOLED Black',
    hint: 'pure black',
    vars: {
      ...FVC_DARK,
      '--bg': '#000000',
      '--bg-2': '#0a0c10',
      '--card': '#101318',
      '--card-hover': '#191d25',
      '--text-2': '#a6afbc',
      '--text-3': '#667080',
      '--control-bg': '#1c222c',
      '--scroll-thumb': '#222834',
      '--scroll-thumb-hover': '#2e3542',
      '--titlebar-bg': 'rgba(5, 6, 8, 0.75)',
      '--sidebar-bg': 'rgba(5, 6, 8, 0.6)',
      '--notification-bg': 'rgba(10, 12, 16, 0.94)'
    }
  },
  {
    id: 'midnight',
    label: 'Midnight',
    hint: 'deep blue',
    vars: {
      ...FVC_DARK,
      '--bg': '#0b1020',
      '--bg-2': '#111832',
      '--card': '#161f3d',
      '--card-hover': '#1e294e',
      '--text-2': '#a8b3d1',
      '--text-3': '#6b77a0',
      '--line': 'rgba(160, 180, 255, 0.09)',
      '--line-strong': 'rgba(160, 180, 255, 0.2)',
      '--hover': 'rgba(160, 180, 255, 0.07)',
      '--hover-strong': 'rgba(160, 180, 255, 0.13)',
      '--control-bg': '#25305a',
      '--scroll-thumb': '#26305a',
      '--scroll-thumb-hover': '#33407a',
      '--titlebar-bg': 'rgba(13, 18, 38, 0.7)',
      '--sidebar-bg': 'rgba(13, 18, 38, 0.55)',
      '--notification-bg': 'rgba(18, 25, 50, 0.92)'
    }
  },
  {
    id: 'nord',
    label: 'Nord',
    hint: 'arctic',
    vars: {
      ...FVC_DARK,
      '--bg': '#2e3440',
      '--bg-2': '#353c4a',
      '--card': '#3b4252',
      '--card-hover': '#434c5e',
      '--text': '#eceff4',
      '--text-2': '#d8dee9',
      '--text-3': '#8f9aae',
      '--line': 'rgba(216, 222, 233, 0.08)',
      '--line-strong': 'rgba(216, 222, 233, 0.2)',
      '--hover': 'rgba(216, 222, 233, 0.06)',
      '--hover-strong': 'rgba(216, 222, 233, 0.12)',
      '--control-bg': '#4c566a',
      '--scroll-thumb': '#4c566a',
      '--scroll-thumb-hover': '#5b6778',
      '--titlebar-bg': 'rgba(41, 46, 57, 0.75)',
      '--sidebar-bg': 'rgba(41, 46, 57, 0.6)',
      '--notification-bg': 'rgba(59, 66, 82, 0.94)'
    }
  },
  {
    id: 'light',
    label: 'Light',
    hint: 'bright',
    vars: {
      '--bg': '#f2f4f8',
      '--bg-2': '#e9ecf2',
      '--card': '#ffffff',
      '--card-hover': '#f2f4fa',
      '--text': '#151a22',
      '--text-2': '#4a5568',
      '--text-3': '#8a94a4',
      '--line': 'rgba(20, 26, 40, 0.1)',
      '--line-strong': 'rgba(20, 26, 40, 0.22)',
      '--hover': 'rgba(20, 26, 40, 0.05)',
      '--hover-strong': 'rgba(20, 26, 40, 0.1)',
      '--control-bg': '#d5dae3',
      '--scroll-thumb': '#c3cad6',
      '--scroll-thumb-hover': '#aab3c2',
      '--titlebar-bg': 'rgba(255, 255, 255, 0.75)',
      '--sidebar-bg': 'rgba(255, 255, 255, 0.6)',
      '--notification-bg': 'rgba(255, 255, 255, 0.95)',
      '--on-accent': '#0b1622'
    }
  }
]

export function themeById(id: string): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}
