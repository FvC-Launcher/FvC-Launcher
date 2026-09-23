import { useEffect, useState, type ReactNode } from 'react'
import { Image, Package, Sparkles, type LucideIcon } from 'lucide-react'
import { Select } from '@/components/ui'
import { ModBrowser } from '@/components/ModBrowser'
import { ProfileCover } from '@/components/ProfileCover'
import { useApp, useSelectedProfile } from '@/store'
import { LOADER_LABELS } from '@/lib'
import type { ContentKind } from '@shared/types'

const KINDS: { id: ContentKind; label: string; icon: LucideIcon; hint: string; color: string }[] = [
  { id: 'mod', label: 'Mods', icon: Package, hint: 'New features, content and performance', color: '#34d399' },
  { id: 'resourcepack', label: 'Resource packs', icon: Image, hint: 'Textures, sounds and models', color: '#fbbf24' },
  { id: 'shaderpack', label: 'Shaders', icon: Sparkles, hint: 'Lighting, shadows and water', color: '#a78bfa' }
]

export function ModsPage(): ReactNode {
  const profiles = useApp((s) => s.profiles)
  const selectProfile = useApp((s) => s.selectProfile)
  const profile = useSelectedProfile()
  const [kind, setKind] = useState<ContentKind>('mod')
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set())
  const [reloadKey, setReloadKey] = useState(0)

  // So results already in the target profile show as installed.
  useEffect(() => {
    setInstalledIds(new Set())
    if (!profile) return
    let cancelled = false
    void window.fvc.content.list(profile.id, kind).then((items) => {
      if (!cancelled) setInstalledIds(new Set(items.map((i) => i.modrinthProjectId).filter(Boolean) as string[]))
    })
    return () => {
      cancelled = true
    }
  }, [profile?.id, kind, reloadKey])

  return (
    <>
      <div className="page-header mods-header">
        <div>
          <h1>Discover</h1>
          <div className="subtitle">Install from Modrinth straight into a profile, dependencies included.</div>
        </div>
        <div className="mods-target">
          {profile && (
            <span className="mods-target-thumb">
              <ProfileCover profile={profile} />
            </span>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="mods-target-label">Install into</div>
            <Select
              value={profile?.id}
              placeholder="Select a profile…"
              options={profiles.map((p) => ({
                value: p.id,
                label: p.name,
                hint: `${p.minecraftVersion} · ${LOADER_LABELS[p.loader]}`
              }))}
              onChange={(id) => void selectProfile(id)}
            />
          </div>
        </div>
      </div>

      <div className="mods-kinds" role="tablist">
        {KINDS.map(({ id, label, icon: Icon, hint, color }) => (
          <button
            key={id}
            role="tab"
            aria-selected={kind === id}
            className={`mods-kind ${kind === id ? 'active' : ''}`}
            style={{ ['--kind' as never]: color }}
            onClick={() => setKind(id)}
          >
            <span className="mods-kind-icon">
              <Icon size={19} />
            </span>
            <span className="mods-kind-text">
              <span className="mods-kind-label">{label}</span>
              <span className="mods-kind-hint">{hint}</span>
            </span>
          </button>
        ))}
      </div>

      <ModBrowser
        kind={kind}
        profile={profile}
        installedProjectIds={installedIds}
        onInstalled={() => setReloadKey((k) => k + 1)}
      />
    </>
  )
}
