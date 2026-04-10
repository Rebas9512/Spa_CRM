import type { MiddlewareHandler } from 'hono'

export function requireRole(role: string): MiddlewareHandler {
  return async (c, next) => {
    const session = c.get('session') as { role: string } | undefined
    if (!session || session.role !== role) {
      return c.json({ error: 'Forbidden' }, 403)
    }
    await next()
  }
}
