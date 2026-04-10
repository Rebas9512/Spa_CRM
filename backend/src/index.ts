import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { MASSAGE_TYPES } from '@spa-crm/shared'
import { foreignKeysMiddleware } from './middleware/foreignKeys'
import { storeSessionMiddleware } from './middleware/storeSession'
import { adminAuthMiddleware } from './middleware/adminAuth'
import { requireRole } from './middleware/requireRole'
import authRoutes from './routes/auth'
import customersRoutes from './routes/customers'
import intakeRoutes from './routes/intake'
import visitsRoutes from './routes/visits'
import storesRoutes from './routes/stores'
import manageRoutes from './routes/manage'
import adminRoutes from './routes/admin'

type Bindings = { DB: D1Database; JWT_SECRET: string }

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', cors({
  origin: ['https://spa.rebasllm.com', 'http://localhost:5173'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}))
app.use('/api/*', foreignKeysMiddleware)

// --- Health check ---
app.get('/api/health', (c) =>
  c.json({ status: 'ok', timestamp: new Date().toISOString(), serviceTypes: MASSAGE_TYPES.length }),
)

// --- Public auth routes (no auth required) ---
// register, login, store-pin, store-join, stores/:id/info
app.route('/api/auth', authRoutes)

// --- Store info (public) ---
app.get('/api/stores/:id/info', async (c) => {
  const storeId = c.req.param('id')
  const store = await c.env.DB.prepare('SELECT name FROM stores WHERE id = ?').bind(storeId).first<{ name: string }>()
  if (!store) return c.json({ error: 'Store not found' }, 404)
  const active = await c.env.DB.prepare('SELECT id FROM store_sessions WHERE store_id = ? AND closed_at IS NULL').bind(storeId).first()
  return c.json({ name: store.name, isOpen: !!active })
})

// --- Admin panel (Admin JWT) — must be mounted BEFORE storeOps to avoid middleware conflict ---
const adminOps = new Hono<{ Bindings: Bindings }>()
adminOps.use('*', adminAuthMiddleware)
adminOps.route('/', adminRoutes)
app.route('/api/admin', adminOps)

// --- Store-admin management (Store Session JWT + role=store_admin) ---
const manageOps = new Hono<{ Bindings: Bindings }>()
manageOps.use('*', storeSessionMiddleware)
manageOps.use('*', requireRole('store_admin'))
manageOps.route('/', manageRoutes)
app.route('/api/manage', manageOps)

// --- Store operation routes (need Store Session JWT) ---
const storeOps = new Hono<{ Bindings: Bindings }>()
storeOps.use('*', storeSessionMiddleware)
storeOps.route('/customers', customersRoutes)
storeOps.route('/', intakeRoutes)
storeOps.route('/', visitsRoutes)
storeOps.route('/stores', storesRoutes)
app.route('/api', storeOps)

// Global error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err)
  return c.json({ error: 'Internal server error' }, 500)
})

export default app
