import type { MiddlewareHandler } from 'hono'
import { verifyJWT } from '../lib/jwt'

export const adminAuthMiddleware: MiddlewareHandler = async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!token) return c.json({ error: 'Not authenticated' }, 401)

  const payload = await verifyJWT(token, c.env.JWT_SECRET)
  if (!payload || payload.type !== 'admin') return c.json({ error: 'Unauthorized' }, 401)

  c.set('admin', { adminId: payload.adminId as string })
  await next()
}
