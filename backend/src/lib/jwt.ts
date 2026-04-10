// Simple HMAC-SHA256 JWT — Web Crypto API (Cloudflare Workers compatible)
// Store JWT: no exp (session validity via store_session)
// Admin JWT: exp +30d

function base64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (str.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function hmacSign(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return base64url(sig)
}

async function hmacVerify(data: string, signature: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  return crypto.subtle.verify('HMAC', key, base64urlDecode(signature), new TextEncoder().encode(data))
}

const HEADER = base64url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))

export async function signJWT(
  payload: Record<string, unknown>,
  secret: string,
  expiresInSeconds?: number,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const claims: Record<string, unknown> = { ...payload, iat: now }
  if (expiresInSeconds) {
    claims.exp = now + expiresInSeconds
  }
  const encodedPayload = base64url(new TextEncoder().encode(JSON.stringify(claims)))
  const signature = await hmacSign(`${HEADER}.${encodedPayload}`, secret)
  return `${HEADER}.${encodedPayload}.${signature}`
}

export async function verifyJWT(
  token: string,
  secret: string,
): Promise<Record<string, unknown> | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, payload, signature] = parts
  const valid = await hmacVerify(`${header}.${payload}`, signature, secret)
  if (!valid) return null
  try {
    const decoded = JSON.parse(new TextDecoder().decode(base64urlDecode(payload)))
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) return null
    return decoded
  } catch {
    return null
  }
}
