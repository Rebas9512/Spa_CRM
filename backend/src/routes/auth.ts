import { Hono } from 'hono'
import { hashPassword, verifyHash } from '../lib/hash'
import { signJWT } from '../lib/jwt'
import { generateId } from '../lib/id'
import { storeSessionMiddleware } from '../middleware/storeSession'
import { registerSchema, loginSchema, storePinSchema } from '@spa-crm/shared'

type Bindings = { DB: D1Database; JWT_SECRET: string }
type StoreSession = { storeId: string; role: string; sessionId: string; sessionStartAt: string }

const auth = new Hono<{ Bindings: Bindings; Variables: { session: StoreSession } }>()

// --- POST /auth/register ---
auth.post('/register', async (c) => {
  const parsed = registerSchema.safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400)
  const { inviteCode, email, password, name } = parsed.data

  const code = await c.env.DB.prepare(
    'SELECT * FROM invite_codes WHERE code = ? AND used_by IS NULL',
  ).bind(inviteCode).first()
  if (!code) return c.json({ error: 'Invalid or used invite code' }, 400)

  const existing = await c.env.DB.prepare('SELECT id FROM admins WHERE email = ?').bind(email).first()
  if (existing) return c.json({ error: 'Email already registered' }, 409)

  const id = generateId()
  const passwordHash = await hashPassword(password)

  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO admins (id, email, password_hash, name) VALUES (?, ?, ?, ?)').bind(id, email, passwordHash, name),
    c.env.DB.prepare("UPDATE invite_codes SET used_by = ?, used_at = datetime('now') WHERE id = ?").bind(id, code.id),
  ])

  return c.json({ adminId: id, email }, 201)
})

// --- POST /auth/login ---
auth.post('/login', async (c) => {
  const parsed = loginSchema.safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: 'Invalid input' }, 400)
  const { email, password } = parsed.data

  const admin = await c.env.DB.prepare('SELECT * FROM admins WHERE email = ?').bind(email).first<Record<string, string>>()
  if (!admin) return c.json({ error: 'Invalid credentials' }, 401)

  const valid = await verifyHash(password, admin.password_hash)
  if (!valid) return c.json({ error: 'Invalid credentials' }, 401)

  const token = await signJWT(
    { adminId: admin.id, type: 'admin' },
    c.env.JWT_SECRET,
    30 * 24 * 60 * 60, // 30 days
  )

  return c.json({ token, adminId: admin.id, name: admin.name })
})

// --- POST /auth/store-pin ---
auth.post('/store-pin', async (c) => {
  const parsed = storePinSchema.safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: 'Invalid input' }, 400)
  const { storeId, pin } = parsed.data

  const store = await c.env.DB.prepare('SELECT * FROM stores WHERE id = ?').bind(storeId).first<Record<string, string>>()
  if (!store) return c.json({ error: 'Store not found' }, 404)

  // PIN match order: staff first, then admin (14.7)
  let role: string
  if (await verifyHash(pin, store.staff_pin_hash)) {
    role = 'staff'
  } else if (await verifyHash(pin, store.admin_pin_hash)) {
    role = 'store_admin'
  } else {
    return c.json({ error: 'Invalid PIN' }, 401)
  }

  // Get or create store_session (14.5/14.6)
  let activeSession = await c.env.DB.prepare(
    'SELECT * FROM store_sessions WHERE store_id = ? AND closed_at IS NULL ORDER BY opened_at ASC LIMIT 1',
  ).bind(storeId).first<Record<string, string>>()

  let isNewSession = false
  if (!activeSession) {
    const sessionId = generateId()
    await c.env.DB.prepare('INSERT INTO store_sessions (id, store_id) VALUES (?, ?)').bind(sessionId, storeId).run()
    activeSession = await c.env.DB.prepare(
      'SELECT * FROM store_sessions WHERE store_id = ? AND closed_at IS NULL ORDER BY opened_at ASC LIMIT 1',
    ).bind(storeId).first<Record<string, string>>()
    isNewSession = true
  }

  // Store JWT: no time expiry — validity via store_session only
  const token = await signJWT(
    { storeId, role, sessionId: activeSession!.id, sessionStartAt: activeSession!.opened_at },
    c.env.JWT_SECRET,
  )

  return c.json({ token, role, storeName: store.name, sessionId: activeSession!.id, isNewSession })
})

// --- POST /auth/store-join ---
auth.post('/store-join', async (c) => {
  const body = await c.req.json<{ storeId: string }>()
  const { storeId } = body

  const store = await c.env.DB.prepare('SELECT * FROM stores WHERE id = ?').bind(storeId).first<Record<string, string>>()
  if (!store) return c.json({ error: 'Store not found' }, 404)

  const activeSession = await c.env.DB.prepare(
    'SELECT * FROM store_sessions WHERE store_id = ? AND closed_at IS NULL ORDER BY opened_at ASC LIMIT 1',
  ).bind(storeId).first<Record<string, string>>()

  if (!activeSession) return c.json({ error: 'Store is not open' }, 403)

  const token = await signJWT(
    { storeId, role: 'staff', sessionId: activeSession.id, sessionStartAt: activeSession.opened_at },
    c.env.JWT_SECRET,
  )

  return c.json({ token, role: 'staff', storeName: store.name, sessionId: activeSession.id })
})

// --- POST /auth/closeout ---
// storeSessionMiddleware applied inline because auth routes are mounted as public.
// This is intentional: closeout requires a valid Store JWT + PIN double verification.
auth.post('/closeout', storeSessionMiddleware, async (c) => {
  const session = c.get('session') as StoreSession
  const body = await c.req.json<{ pin: string }>()

  const store = await c.env.DB.prepare('SELECT * FROM stores WHERE id = ?').bind(session.storeId).first<Record<string, string>>()
  if (!store) return c.json({ error: 'Store not found' }, 404)

  const staffPinValid = await verifyHash(body.pin, store.staff_pin_hash)
  const adminPinValid = !staffPinValid && store.admin_pin_hash
    ? await verifyHash(body.pin, store.admin_pin_hash)
    : false
  if (!staffPinValid && !adminPinValid) return c.json({ error: 'Invalid PIN' }, 401)

  // Check pending therapist signatures (exclude cancelled)
  const pending = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM visits WHERE store_id = ? AND therapist_signed_at IS NULL AND cancelled_at IS NULL',
  ).bind(session.storeId).first<{ count: number }>()

  if (pending && pending.count > 0) {
    return c.json({ error: `${pending.count} visits awaiting therapist signature`, pendingCount: pending.count }, 409)
  }

  await c.env.DB.prepare(
    "UPDATE store_sessions SET closed_at = datetime('now') WHERE store_id = ? AND closed_at IS NULL",
  ).bind(session.storeId).run()

  return c.json({ closedAt: new Date().toISOString(), sessionId: session.sessionId })
})

export default auth
