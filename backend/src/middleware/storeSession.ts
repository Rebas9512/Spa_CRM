import type { MiddlewareHandler } from 'hono'
import { verifyJWT } from '../lib/jwt'

export const storeSessionMiddleware: MiddlewareHandler = async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!token) return c.json({ error: 'No active session' }, 401)

  const payload = await verifyJWT(token, c.env.JWT_SECRET)
  if (!payload) return c.json({ error: 'Session invalid' }, 401)

  const activeSession = await c.env.DB.prepare(
    'SELECT id FROM store_sessions WHERE store_id = ? AND closed_at IS NULL',
  )
    .bind(payload.storeId)
    .first()

  if (!activeSession) {
    return c.json({ error: 'Store closed' }, 410)
  }

  c.set('session', {
    storeId: payload.storeId as string,
    role: payload.role as string,
    sessionId: payload.sessionId as string,
    sessionStartAt: payload.sessionStartAt as string,
  })
  await next()
}
