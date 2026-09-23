import type { ReactNode } from 'react'
import { profileIcon } from '@/lib'
import type { Profile } from '@shared/types'

/** Stable hue per profile, so cards without a cover image are still easy to tell apart. */
function coverHue(id: string): number {
  let hue = 0
  for (const ch of id) hue = (hue * 31 + ch.charCodeAt(0)) % 360
  return hue
}

/** The profile's background image, or a generated banner tinted from its id. */
export function ProfileCover({
  profile
}: {
  profile: Pick<Profile, 'id' | 'icon' | 'backgroundImage'>
}): ReactNode {
  const Icon = profileIcon(profile.icon)
  return (
    <div
      className={`pf-cover ${profile.backgroundImage ? 'has-image' : ''}`}
      style={{ ['--hue' as never]: String(coverHue(profile.id)) }}
    >
      {profile.backgroundImage ? (
        <div className="pf-cover-img" style={{ backgroundImage: `url("${profile.backgroundImage}")` }} />
      ) : (
        <Icon className="pf-cover-glyph" strokeWidth={1.25} />
      )}
    </div>
  )
}
