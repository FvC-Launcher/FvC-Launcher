import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Bug,
  Calendar,
  Download,
  ExternalLink,
  Globe,
  Heart,
  Package,
  Scale,
  ScrollText
} from 'lucide-react'
import { Button, Modal, Select, Tabs } from '@/components/ui'
import { formatCount, formatRelative, useApp } from '@/store'
import { renderMarkdown } from '@/markdown'
import { titleCase } from '@/lib'
import type { ContentKind, ModrinthProject, ModrinthVersion } from '@shared/types'

function kindFromProjectType(projectType: string): ContentKind {
  if (projectType === 'resourcepack') return 'resourcepack'
  if (projectType === 'shader') return 'shaderpack'
  return 'mod'
}

export function ModDetailsModal(): ReactNode {
  const projectId = useApp((s) => s.openProjectId)
  const preview = useApp((s) => s.openProjectPreview)
  const openProject = useApp((s) => s.openProject)
  const profiles = useApp((s) => s.profiles)
  const selectedProfileId = useApp((s) => s.selectedProfileId)
  const pushNotification = useApp((s) => s.pushNotification)

  const [project, setProject] = useState<ModrinthProject | null>(null)
  const [versions, setVersions] = useState<ModrinthVersion[]>([])
  const [tab, setTab] = useState('description')
  const [targetProfileId, setTargetProfileId] = useState<string | null>(null)
  const [installing, setInstalling] = useState<string | null>(null)

  useEffect(() => {
    setProject(null)
    setVersions([])
    setTab('description')
    if (!projectId) return
    let cancelled = false
    void (async () => {
      try {
        const proj = await window.fvc.modrinth.project(projectId)
        if (cancelled) return
        setProject(proj)
        const vers = await window.fvc.modrinth.versions(projectId)
        if (!cancelled) setVersions(vers)
      } catch (err) {
        pushNotification({
          type: 'error',
          title: 'Could not load project',
          body: err instanceof Error ? err.message : String(err)
        })
        openProject(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, pushNotification, openProject])

  useEffect(() => {
    setTargetProfileId(selectedProfileId)
  }, [selectedProfileId, projectId])

  const kind = project ? kindFromProjectType(project.project_type) : 'mod'
  const targetProfile = profiles.find((p) => p.id === targetProfileId) ?? null

  const compatibleVersions = useMemo(() => {
    if (!targetProfile) return versions
    return versions.filter((v) => {
      const mcOk = v.game_versions.includes(targetProfile.minecraftVersion)
      const loaderOk =
        kind !== 'mod' ||
        targetProfile.loader === 'vanilla' ||
        v.loaders.includes(targetProfile.loader)
      return mcOk && loaderOk
    })
  }, [versions, targetProfile, kind])

  const install = async (versionId?: string): Promise<void> => {
    if (!project || !targetProfile) return
    setInstalling(versionId ?? 'latest')
    try {
      await window.fvc.modrinth.install(targetProfile.id, kind, project.id, versionId)
      pushNotification({
        type: 'success',
        title: `${project.title} installed`,
        body: `Added to ${targetProfile.name}.`
      })
    } catch (err) {
      pushNotification({
        type: 'error',
        title: 'Install failed',
        body: err instanceof Error ? err.message : String(err)
      })
    } finally {
      setInstalling(null)
    }
  }

  const externalLinks = project
    ? ([
        project.source_url && { label: 'Source', url: project.source_url, icon: Globe },
        project.issues_url && { label: 'Issues', url: project.issues_url, icon: Bug },
        project.wiki_url && { label: 'Wiki', url: project.wiki_url, icon: ScrollText }
      ].filter(Boolean) as { label: string; url: string; icon: typeof Globe }[])
    : []

  const tabs = [
    { id: 'description', label: 'Description' },
    ...(project?.gallery?.length ? [{ id: 'gallery', label: 'Gallery' }] : []),
    { id: 'versions', label: 'Versions' },
    { id: 'changelog', label: 'Changelog' }
  ]

  return (
    <Modal open={projectId !== null} onClose={() => openProject(null)} wide>
      {!project ? (
        <div className="empty-state" style={{ minHeight: 300 }}>
          <span className="spinner" style={{ width: 28, height: 28, color: 'var(--accent)' }} />
        </div>
      ) : (
        <>
          <div className="modal-body" style={{ gap: 18 }}>
            <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
              {project.icon_url ? (
                <img className="mod-icon" src={project.icon_url} alt="" style={{ width: 76, height: 76 }} />
              ) : (
                <span className="mod-icon" style={{ width: 76, height: 76 }}>
                  <Package size={30} />
                </span>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row between">
                  <h1 style={{ fontSize: '1.35rem' }}>{project.title}</h1>
                  <Button variant="subtle" icon={ExternalLink}
                    onClick={() => window.fvc.system.openExternal(`https://modrinth.com/${project.project_type}/${project.slug}`)}
                  >
                    Modrinth
                  </Button>
                </div>
                <p className="muted" style={{ marginTop: 4, fontSize: '0.9rem', lineHeight: 1.5 }}>
                  {project.description}
                </p>
                <div className="mod-stats" style={{ marginTop: 10 }}>
                  <span>
                    <Download /> {formatCount(project.downloads)} downloads
                  </span>
                  <span>
                    <Heart /> {formatCount(project.followers)} followers
                  </span>
                  <span>
                    <Calendar /> Updated {formatRelative(project.updated)}
                  </span>
                  {project.license && (
                    <span>
                      <Scale /> {project.license.id}
                    </span>
                  )}
                  {project.categories.slice(0, 4).map((c) => (
                    <span key={c} className="badge">
                      {titleCase(c)}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
              <Tabs tabs={tabs} active={tab} onChange={setTab} />
              <div className="row" style={{ gap: 8 }}>
                {externalLinks.map((link) => (
                  <Button
                    key={link.label}
                    variant="subtle"
                    icon={link.icon}
                    onClick={() => window.fvc.system.openExternal(link.url)}
                  >
                    {link.label}
                  </Button>
                ))}
                {!preview && (
                  <>
                    <div style={{ width: 200 }}>
                      <Select
                        value={targetProfileId ?? undefined}
                        placeholder="Install into…"
                        options={profiles.map((p) => ({ value: p.id, label: p.name }))}
                        onChange={setTargetProfileId}
                      />
                    </div>
                    <Button
                      variant="primary"
                      icon={Download}
                      loading={installing === 'latest'}
                      disabled={!targetProfile || compatibleVersions.length === 0}
                      onClick={() => void install()}
                    >
                      Install
                    </Button>
                  </>
                )}
              </div>
            </div>

            {!preview && targetProfile && compatibleVersions.length === 0 && versions.length > 0 && (
              <div className="badge warning" style={{ alignSelf: 'flex-start' }}>
                No version compatible with {targetProfile.name} ({targetProfile.minecraftVersion})
              </div>
            )}

            {tab === 'description' && (
              <div
                className="md-body"
                onClick={(e) => {
                  const anchor = (e.target as HTMLElement).closest('a')
                  if (anchor?.getAttribute('href')) {
                    e.preventDefault()
                    window.fvc.system.openExternal(anchor.getAttribute('href')!)
                  }
                }}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(project.body) }}
              />
            )}

            {tab === 'gallery' && (
              <div className="grid-cards">
                {project.gallery.map((img) => (
                  <figure key={img.url} className="card" style={{ overflow: 'hidden' }}>
                    <img src={img.url} alt={img.title ?? ''} style={{ width: '100%', display: 'block' }} loading="lazy" />
                    {img.title && (
                      <figcaption style={{ padding: '10px 12px', fontSize: '0.82rem', color: 'var(--text-2)' }}>
                        {img.title}
                      </figcaption>
                    )}
                  </figure>
                ))}
              </div>
            )}

            {tab === 'versions' && (
              <div className="stack" style={{ gap: 8 }}>
                {(targetProfile && !preview ? compatibleVersions : versions).slice(0, 30).map((version) => (
                  <div key={version.id} className="card mod-row" style={{ alignItems: 'center', padding: '11px 14px' }}>
                    <div className="mod-meta">
                      <div className="mod-title">
                        {version.name || version.version_number}
                        <span className={`badge ${version.version_type === 'release' ? 'success' : 'warning'}`}>
                          {version.version_type}
                        </span>
                      </div>
                      <div className="tiny" style={{ marginTop: 3 }}>
                        {version.version_number} · {version.loaders.join(', ')} ·{' '}
                        {version.game_versions.slice(0, 6).join(', ')}
                        {version.game_versions.length > 6 ? '…' : ''} ·{' '}
                        {formatRelative(version.date_published)}
                      </div>
                    </div>
                    {!preview && (
                      <Button
                        icon={Download}
                        loading={installing === version.id}
                        disabled={!targetProfile}
                        onClick={() => void install(version.id)}
                      >
                        Install
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {tab === 'changelog' && (
              <div className="stack" style={{ gap: 12 }}>
                {versions.slice(0, 10).map((version) => (
                  <div key={version.id} className="card" style={{ padding: 16 }}>
                    <div className="row between">
                      <h3>{version.version_number}</h3>
                      <span className="tiny">{formatRelative(version.date_published)}</span>
                    </div>
                    <div
                      className="md-body"
                      style={{ marginTop: 8 }}
                      dangerouslySetInnerHTML={{
                        __html: renderMarkdown(version.changelog || '_No changelog provided._')
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </Modal>
  )
}
