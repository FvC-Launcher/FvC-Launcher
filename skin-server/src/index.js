/**
 * FvC skin server.
 *
 *   GET    /skins/:name   PNG + X-Skin-Model (classic|slim) + ETag, or 404
 *   PUT    /skins/:name   raw PNG body, X-Skin-Model header, Authorization: Bearer <secret>
 *   DELETE /skins/:name   Authorization: Bearer <secret>
 *
 * Offline accounts can't be verified, so a name belongs to whichever launcher
 * uploaded it first: only the sha256 of its secret is stored, and later writes
 * must present the same secret.
 */

const NAME_RE = /^[A-Za-z0-9_]{1,16}$/
const MAX_BYTES = 64 * 1024
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

export default {
  async fetch(request, env) {
    const match = new URL(request.url).pathname.match(/^\/skins\/([^/]+)$/)
    if (!match) return text(404, 'Not found')

    const name = decodeURIComponent(match[1])
    if (!NAME_RE.test(name)) return text(400, 'Invalid player name')
    const key = name.toLowerCase()

    switch (request.method) {
      case 'GET':
      case 'HEAD':
        return getSkin(request, env, key)
      case 'PUT':
        return putSkin(request, env, key)
      case 'DELETE':
        return deleteSkin(request, env, key)
      default:
        return text(405, 'Method not allowed')
    }
  }
}

async function getSkin(request, env, key) {
  const { value, metadata } = await env.SKINS.getWithMetadata(`skin:${key}`, 'arrayBuffer')
  if (!value) return text(404, 'No skin for that player')

  const headers = {
    'Content-Type': 'image/png',
    'X-Skin-Model': metadata?.model === 'slim' ? 'slim' : 'classic',
    ETag: `"${metadata?.hash ?? ''}"`,
    'Cache-Control': 'public, max-age=60'
  }
  if (request.headers.get('If-None-Match') === headers.ETag) {
    return new Response(null, { status: 304, headers })
  }
  return new Response(request.method === 'HEAD' ? null : value, { headers })
}

async function putSkin(request, env, key) {
  const denied = await authorize(request, env, key)
  if (denied) return denied

  const bytes = new Uint8Array(await request.arrayBuffer())
  if (bytes.byteLength > MAX_BYTES) return text(413, 'Skin is too large')
  if (bytes.byteLength < 24 || !PNG_SIGNATURE.every((b, i) => bytes[i] === b)) {
    return text(400, 'Not a PNG image')
  }
  const view = new DataView(bytes.buffer)
  const width = view.getUint32(16)
  const height = view.getUint32(20)
  if (width !== 64 || (height !== 64 && height !== 32)) {
    return text(400, `A skin must be 64x64 or 64x32, got ${width}x${height}`)
  }

  const model = request.headers.get('X-Skin-Model') === 'slim' ? 'slim' : 'classic'
  const hash = await sha256(bytes)
  await env.SKINS.put(`skin:${key}`, bytes, { metadata: { model, hash } })
  return text(200, 'Saved')
}

async function deleteSkin(request, env, key) {
  const denied = await authorize(request, env, key)
  if (denied) return denied
  await env.SKINS.delete(`skin:${key}`)
  return text(200, 'Deleted')
}

/** Returns an error response, or null when the caller owns (or just claimed) the name. */
async function authorize(request, env, key) {
  const secret = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (secret.length < 32) return text(401, 'Missing or invalid secret')

  const hash = await sha256(new TextEncoder().encode(secret))
  const owner = await env.SKINS.get(`owner:${key}`)
  if (owner === null) {
    await env.SKINS.put(`owner:${key}`, hash)
    return null
  }
  return owner === hash ? null : text(403, 'That name is already used by another FvC Launcher player')
}

async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function text(status, body) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
