import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import {
  Download,
  Home,
  Info,
  Layers,
  Package,
  Play,
  Settings,
  User,
  type LucideIcon
} from 'lucide-react'
import { useApp } from '@/store'
import type { Page } from '@shared/types'

const NAV: { page: Page; label: string; icon: LucideIcon }[] = [
  { page: 'home', label: 'Home', icon: Home },
  { page: 'play', label: 'Play', icon: Play },
  { page: 'profiles', label: 'Profiles', icon: Layers },
  { page: 'mods', label: 'Mods', icon: Package },
  { page: 'downloads', label: 'Downloads', icon: Download },
  { page: 'accounts', label: 'Accounts', icon: User }
]

const NAV_BOTTOM: { page: Page; label: string; icon: LucideIcon }[] = [
  { page: 'settings', label: 'Settings', icon: Settings },
  { page: 'about', label: 'About', icon: Info }
]

function NavButton({
  page,
  label,
  icon: Icon
}: {
  page: Page
  label: string
  icon: LucideIcon
}): ReactNode {
  const active = useApp((s) => s.page === page)
  const navigate = useApp((s) => s.navigate)
  const downloadsBadge = useApp(
    (s) => page === 'downloads' && s.downloads.some((d) => d.status === 'downloading')
  )

  return (
    <button className={`nav-item ${active ? 'active' : ''}`} onClick={() => navigate(page)} title={label}>
      {active && (
        <>
          <motion.span
            className="nav-pill"
            layoutId="nav-pill"
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          />
          <motion.span
            className="nav-glow"
            layoutId="nav-glow"
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          />
        </>
      )}
      <Icon />
      <span className="nav-label">{label}</span>
      {downloadsBadge && (
        <span
          className="spinner nav-spinner"
          style={{ width: 13, height: 13, marginLeft: 'auto', color: 'var(--accent)' }}
        />
      )}
    </button>
  )
}

export function Sidebar(): ReactNode {
  return (
    <nav className="sidebar">
      <div className="section-label">Launcher</div>
      {NAV.map((item) => (
        <NavButton key={item.page} {...item} />
      ))}
      <div className="spacer" />
      {NAV_BOTTOM.map((item) => (
        <NavButton key={item.page} {...item} />
      ))}
    </nav>
  )
}
