import type { MiddlewareHandler } from 'hono'

export const foreignKeysMiddleware: MiddlewareHandler = async (c, next) => {
  await c.env.DB.exec('PRAGMA foreign_keys = ON')
  await next()
}
