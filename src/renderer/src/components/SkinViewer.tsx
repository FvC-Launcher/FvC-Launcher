import { useEffect, useRef, type ReactNode } from 'react'
import type { SkinModel } from '@shared/types'

/**
 * Draws a Minecraft skin texture as a flat front/back view of the player
 * model. The texture arrives as a data: URL from main, so the canvas stays
 * untainted and pixel-perfect upscaling works.
 *
 * Coordinates below are texture pixels in the standard 64x64 layout; the model
 * itself is laid out on a 16x32 grid (4px margin for a 4px-wide arm).
 */

type Rect = [x: number, y: number, w: number, h: number]

interface DrawOp {
  src: Rect
  dx: number
  dy: number
  /** Legacy 64x32 skins have no left limbs — mirror the right one instead. */
  flip?: boolean
}

const GRID_W = 16
const GRID_H = 32
const ARM_WIDTH: Record<SkinModel, number> = { classic: 4, slim: 3 }

function baseParts(model: SkinModel, back: boolean, legacy: boolean): DrawOp[] {
  const aw = ARM_WIDTH[model]
  const slim = model === 'slim'
  const ops: DrawOp[] = [
    { src: back ? [24, 8, 8, 8] : [8, 8, 8, 8], dx: 4, dy: 0 }, // head
    { src: back ? [32, 20, 8, 12] : [20, 20, 8, 12], dx: 4, dy: 8 } // torso
  ]

  const rightArm: Rect = back ? [slim ? 51 : 52, 20, aw, 12] : [44, 20, aw, 12]
  const leftArm: Rect | null = legacy
    ? null
    : back
      ? [slim ? 43 : 44, 52, aw, 12]
      : [36, 52, aw, 12]
  ops.push({ src: rightArm, dx: back ? 12 : 4 - aw, dy: 8 })
  ops.push({ src: leftArm ?? rightArm, dx: back ? 4 - aw : 12, dy: 8, flip: !leftArm })

  const rightLeg: Rect = back ? [12, 20, 4, 12] : [4, 20, 4, 12]
  const leftLeg: Rect | null = legacy ? null : back ? [28, 52, 4, 12] : [20, 52, 4, 12]
  ops.push({ src: rightLeg, dx: back ? 8 : 4, dy: 20 })
  ops.push({ src: leftLeg ?? rightLeg, dx: back ? 4 : 8, dy: 20, flip: !leftLeg })

  return ops
}

function overlayParts(model: SkinModel, back: boolean, legacy: boolean): DrawOp[] {
  const aw = ARM_WIDTH[model]
  const slim = model === 'slim'
  // Pre-1.8 skins only ever carry the hat layer.
  const ops: DrawOp[] = [{ src: back ? [56, 8, 8, 8] : [40, 8, 8, 8], dx: 4, dy: 0 }]
  if (legacy) return ops

  ops.push({ src: back ? [32, 36, 8, 12] : [20, 36, 8, 12], dx: 4, dy: 8 }) // jacket
  ops.push({
    src: back ? [slim ? 51 : 52, 36, aw, 12] : [44, 36, aw, 12],
    dx: back ? 12 : 4 - aw,
    dy: 8
  })
  ops.push({
    src: back ? [slim ? 59 : 60, 52, aw, 12] : [52, 52, aw, 12],
    dx: back ? 4 - aw : 12,
    dy: 8
  })
  ops.push({ src: back ? [12, 36, 4, 12] : [4, 36, 4, 12], dx: back ? 8 : 4, dy: 20 })
  ops.push({ src: back ? [12, 52, 4, 12] : [4, 52, 4, 12], dx: back ? 4 : 8, dy: 20 })
  return ops
}

/**
 * Old 64x32 skins usually fill the unused hat layer with opaque black instead
 * of leaving it transparent, which would hide the whole head. Minecraft has
 * always worked around it the same way: if nothing in the hat area is
 * transparent, every pure black pixel there becomes transparent.
 */
function stripOpaqueHat(ctx: CanvasRenderingContext2D): void {
  const hat = ctx.getImageData(32, 0, 32, 16)
  const px = hat.data
  for (let i = 3; i < px.length; i += 4) {
    if (px[i] < 128) return // the layer is really being used
  }
  for (let i = 0; i < px.length; i += 4) {
    if (px[i] === 0 && px[i + 1] === 0 && px[i + 2] === 0) px[i + 3] = 0
  }
  ctx.putImageData(hat, 32, 0)
}

/** Copies the texture into a canvas so legacy quirks can be patched first. */
function prepareTexture(img: HTMLImageElement): CanvasImageSource {
  const source = document.createElement('canvas')
  source.width = img.width
  source.height = img.height
  const ctx = source.getContext('2d', { willReadFrequently: true })
  if (!ctx) return img
  ctx.drawImage(img, 0, 0)
  if (img.height === 32) stripOpaqueHat(ctx)
  return source
}

function paint(ctx: CanvasRenderingContext2D, img: CanvasImageSource, ops: DrawOp[]): void {
  for (const { src, dx, dy, flip } of ops) {
    const [sx, sy, sw, sh] = src
    if (flip) {
      ctx.save()
      ctx.translate(dx + sw, dy)
      ctx.scale(-1, 1)
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
      ctx.restore()
    } else {
      ctx.drawImage(img, sx, sy, sw, sh, dx, dy, sw, sh)
    }
  }
}

export function SkinViewer({
  dataUrl,
  model,
  view = 'front',
  showOverlay = true,
  scale = 11
}: {
  dataUrl: string
  model: SkinModel
  view?: 'front' | 'back'
  showOverlay?: boolean
  scale?: number
}): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (cancelled) return
      const legacy = img.height === 32
      const back = view === 'back'
      const texture = prepareTexture(img)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.imageSmoothingEnabled = false
      ctx.scale(scale, scale)
      paint(ctx, texture, baseParts(model, back, legacy))
      if (showOverlay) paint(ctx, texture, overlayParts(model, back, legacy))
    }
    img.src = dataUrl

    return () => {
      cancelled = true
    }
  }, [dataUrl, model, view, showOverlay, scale])

  return (
    <canvas
      ref={canvasRef}
      width={GRID_W * scale}
      height={GRID_H * scale}
      className="skin-canvas"
      aria-label="Skin preview"
    />
  )
}
