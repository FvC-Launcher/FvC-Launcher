import { useState, type ReactNode } from 'react'
import { ImagePlus } from 'lucide-react'
import { PROFILE_ICONS, isImageIcon, profileIcon } from '@/lib'
import { useApp } from '@/store'

/** Uploaded icons are stored in the profile itself, so keep them small. */
const ICON_PX = 160

/**
 * A profile's icon: one of the built-in glyphs, or the image the user
 * uploaded, filling its tile.
 */
export function ProfileIcon({ icon, size }: { icon: string; size: number }): ReactNode {
  if (isImageIcon(icon)) return <img className="profile-icon-img" src={icon} alt="" draggable={false} />
  const Icon = profileIcon(icon)
  return <Icon size={size} />
}

/** Center-crop an image to a small square WebP data URL. */
async function shrinkToIcon(src: string): Promise<string> {
  const img = new Image()
  img.src = src
  await img.decode()
  const side = Math.min(img.naturalWidth, img.naturalHeight)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = ICON_PX
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(
    img,
    (img.naturalWidth - side) / 2,
    (img.naturalHeight - side) / 2,
    side,
    side,
    0,
    0,
    ICON_PX,
    ICON_PX
  )
  return canvas.toDataURL('image/webp', 0.9)
}

/**
 * Pick an image file and turn it into a profile icon. Resolves null when the
 * user cancels; failures are reported as a notification.
 */
export function useUploadIcon(): { upload: () => Promise<string | null>; uploading: boolean } {
  const pushNotification = useApp((s) => s.pushNotification)
  const [uploading, setUploading] = useState(false)
  const upload = async (): Promise<string | null> => {
    try {
      const data = await window.fvc.system.pickImageData()
      if (!data) return null
      setUploading(true)
      return await shrinkToIcon(data)
    } catch (err) {
      pushNotification({
        type: 'error',
        title: "Couldn't use that image",
        body: err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err)
      })
      return null
    } finally {
      setUploading(false)
    }
  }
  return { upload, uploading }
}

/** The built-in icons plus a tile to upload your own image. */
export function ProfileIconPicker({
  value,
  onChange
}: {
  value: string
  onChange: (icon: string) => void
}): ReactNode {
  const { upload, uploading } = useUploadIcon()
  const custom = isImageIcon(value)
  return (
    <div className="wz-icons">
      {Object.entries(PROFILE_ICONS).map(([iconName, Icon]) => (
        <button
          key={iconName}
          type="button"
          className={`wz-icon ${value === iconName ? 'active' : ''}`}
          onClick={() => onChange(iconName)}
          aria-label={iconName}
          title={iconName}
        >
          <Icon size={18} />
        </button>
      ))}
      <button
        type="button"
        className={`wz-icon wz-icon-upload ${custom ? 'active has-image' : ''}`}
        disabled={uploading}
        onClick={() => void upload().then((icon) => icon && onChange(icon))}
        aria-label={custom ? 'Change your image' : 'Upload an image'}
        title={custom ? 'Change your image' : 'Upload an image'}
      >
        {uploading ? (
          <span className="spinner" />
        ) : custom ? (
          <img className="profile-icon-img" src={value} alt="" draggable={false} />
        ) : (
          <ImagePlus size={18} />
        )}
      </button>
    </div>
  )
}
