import { useState, type ReactNode } from 'react'
import { Select, Tabs } from '@/components/ui'
import { ModBrowser } from '@/components/ModBrowser'
import { useApp, useSelectedProfile } from '@/store'
import { LOADER_LABELS } from '@/lib'
import type { ContentKind } from '@shared/types'

export function ModsPage(): ReactNode {
  const profiles = useApp((s) => s.profiles)
  const selectProfile = useApp((s) => s.selectProfile)
  const profile = useSelectedProfile()
  const [kind, setKind] = useState<ContentKind>('mod')

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Browse Modrinth</h1>
          <div className="subtitle">
            Mods, resource packs and shaders — installed straight into a profile with dependencies handled.
          </div>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <span className="tiny">Install into</span>
          <div style={{ width: 240 }}>
            <Select
              value={profile?.id}
              placeholder="Select profile…"
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

      <div className="stack" style={{ gap: 16 }}>
        <Tabs
          tabs={[
            { id: 'mod', label: 'Mods' },
            { id: 'resourcepack', label: 'Resource Packs' },
            { id: 'shaderpack', label: 'Shader Packs' }
          ]}
          active={kind}
          onChange={(id) => setKind(id as ContentKind)}
        />
        <ModBrowser kind={kind} profile={profile} />
      </div>
    </>
  )
}
