import { Hono } from 'hono'
import { hashPassword, verifyHash } from '../lib/hash'
import { generateId } from '../lib/id'
import { generateCustomersCsv, generateVisitsCsv } from '../lib/csv'
import { createStoreSchema } from '@spa-crm/shared'

type Bindings = { DB: D1Database; JWT_SECRET: string }
type AdminCtx = { adminId: string }

const admin = new Hono<{ Bindings: Bindings; Variables: { admin: AdminCtx } }>()

// Helper: verify store belongs to admin (14.10)
async function getOwnedStore(db: D1Database, storeId: string, adminId: string) {
  return db.prepare('SELECT * FROM stores WHERE id = ? AND admin_id = ?').bind(storeId, adminId).first<Record<string, unknown>>()
}

// --- GET /admin/me ---
admin.get('/me', async (c) => {
  const { adminId } = c.get('admin')
  const row = await c.env.DB.prepare(
    'SELECT id, email, name, created_at, updated_at FROM admins WHERE id = ?',
  ).bind(adminId).first<Record<string, unknown>>()
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json({ admin: { id: row.id, email: row.email, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at } })
})

// --- PUT /admin/me ---
admin.put('/me', async (c) => {
  const { adminId } = c.get('admin')
  const body = await c.req.json<{ name?: string; currentPassword?: string; newPassword?: string }>()

  if (body.newPassword) {
    if (body.newPassword.length < 8) return c.json({ error: 'New password must be at least 8 characters' }, 400)
    if (!body.currentPassword) return c.json({ error: 'Current password required' }, 400)
    const row = await c.env.DB.prepare('SELECT password_hash FROM admins WHERE id = ?').bind(adminId).first<{ password_hash: string }>()
    if (!row || !(await verifyHash(body.currentPassword, row.password_hash))) {
      return c.json({ error: 'Current password incorrect' }, 400)
    }
    const newHash = await hashPassword(body.newPassword)
    await c.env.DB.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').bind(newHash, adminId).run()
  }

  if (body.name) {
    await c.env.DB.prepare('UPDATE admins SET name = ? WHERE id = ?').bind(body.name, adminId).run()
  }

  return c.json({ updated: true })
})

// --- POST /admin/stores ---
admin.post('/stores', async (c) => {
  const { adminId } = c.get('admin')
  const parsed = createStoreSchema.safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400)
  const { name, address, phone, staffPin, adminPin, timezone } = parsed.data

  try {
    const storeId = generateId()
    const staffPinHash = await hashPassword(staffPin)
    const adminPinHash = await hashPassword(adminPin)
    const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago'

    await c.env.DB.prepare(
      `INSERT INTO stores (id, admin_id, name, address, phone, timezone, staff_pin_hash, admin_pin_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(storeId, adminId, name, address || null, phone || null, tz, staffPinHash, adminPinHash).run()

    return c.json({ storeId, name }, 201)
  } catch (err) {
    console.error('Create store error:', err)
    return c.json({ error: 'Failed to create store' }, 500)
  }
})

// --- GET /admin/stores ---
admin.get('/stores', async (c) => {
  const { adminId } = c.get('admin')
  const rows = await c.env.DB.prepare(
    'SELECT id, name, address, phone, timezone, created_at, updated_at FROM stores WHERE admin_id = ?',
  ).bind(adminId).all<Record<string, unknown>>()

  const stores = await Promise.all(
    (rows.results || []).map(async (s) => {
      const tz = (s.timezone as string) || 'America/Chicago'
      const today = new Date().toLocaleDateString('en-CA', { timeZone: tz })
      const visitCount = await c.env.DB.prepare(
        "SELECT COUNT(*) as count FROM visits WHERE store_id = ? AND visit_date >= ?",
      ).bind(s.id, today).first<{ count: number }>()
      return {
        id: s.id, name: s.name, address: s.address, phone: s.phone,
        timezone: s.timezone, createdAt: s.created_at, updatedAt: s.updated_at,
        visitsToday: visitCount?.count || 0,
      }
    }),
  )

  return c.json({ stores })
})

// --- GET /admin/stores/:id ---
admin.get('/stores/:id', async (c) => {
  const { adminId } = c.get('admin')
  const store = await getOwnedStore(c.env.DB, c.req.param('id'), adminId)
  if (!store) return c.json({ error: 'Not found' }, 404)
  return c.json({
    store: {
      id: store.id, name: store.name, address: store.address, phone: store.phone,
      timezone: store.timezone, createdAt: store.created_at, updatedAt: store.updated_at,
    },
  })
})

// --- PUT /admin/stores/:id ---
admin.put('/stores/:id', async (c) => {
  const { adminId } = c.get('admin')
  const store = await getOwnedStore(c.env.DB, c.req.param('id'), adminId)
  if (!store) return c.json({ error: 'Not found' }, 404)

  const body = await c.req.json<{ name?: string; address?: string; phone?: string }>()
  const fields: string[] = []
  const values: unknown[] = []
  if (body.name !== undefined) { fields.push('name = ?'); values.push(body.name) }
  if (body.address !== undefined) { fields.push('address = ?'); values.push(body.address) }
  if (body.phone !== undefined) { fields.push('phone = ?'); values.push(body.phone) }
  if (fields.length === 0) return c.json({ error: 'No fields to update' }, 400)

  values.push(c.req.param('id'), adminId)
  await c.env.DB.prepare(`UPDATE stores SET ${fields.join(', ')} WHERE id = ? AND admin_id = ?`).bind(...values).run()
  return c.json({ updated: true })
})

// --- PUT /admin/stores/:id/pins ---
admin.put('/stores/:id/pins', async (c) => {
  const { adminId } = c.get('admin')
  const store = await getOwnedStore(c.env.DB, c.req.param('id'), adminId)
  if (!store) return c.json({ error: 'Not found' }, 404)

  const body = await c.req.json<{ staffPin?: string; adminPin?: string }>()
  const pinRegex = /^\d{4}$/
  if (body.staffPin && !pinRegex.test(body.staffPin)) return c.json({ error: 'Staff PIN must be exactly 4 digits' }, 400)
  if (body.adminPin && !pinRegex.test(body.adminPin)) return c.json({ error: 'Admin PIN must be exactly 4 digits' }, 400)

  const fields: string[] = []
  const values: unknown[] = []
  if (body.staffPin) { fields.push('staff_pin_hash = ?'); values.push(await hashPassword(body.staffPin)) }
  if (body.adminPin) { fields.push('admin_pin_hash = ?'); values.push(await hashPassword(body.adminPin)) }
  if (fields.length === 0) return c.json({ error: 'No PINs to update' }, 400)

  values.push(c.req.param('id'), adminId)
  await c.env.DB.prepare(`UPDATE stores SET ${fields.join(', ')} WHERE id = ? AND admin_id = ?`).bind(...values).run()
  return c.json({ updated: true })
})

// --- GET /admin/stores/:id/customers ---
admin.get('/stores/:id/customers', async (c) => {
  const { adminId } = c.get('admin')
  const storeId = c.req.param('id')
  const store = await getOwnedStore(c.env.DB, storeId, adminId)
  if (!store) return c.json({ error: 'Not found' }, 404)

  const search = c.req.query('search') || ''
  const lastVisitAfter = c.req.query('lastVisitAfter')
  const page = parseInt(c.req.query('page') || '1', 10) || 1
  const pageSize = Math.min(parseInt(c.req.query('pageSize') || '20', 10) || 20, 100)
  const offset = (page - 1) * pageSize

  let whereClause = 'WHERE v.store_id = ?'
  const params: unknown[] = [storeId]
  if (search) { whereClause += ' AND (c.first_name LIKE ? OR c.last_name LIKE ? OR c.phone LIKE ?)'; const s = `%${search}%`; params.push(s, s, s) }
  if (lastVisitAfter) { whereClause += ' AND v.visit_date >= ?'; params.push(lastVisitAfter) }

  const countResult = await c.env.DB.prepare(
    `SELECT COUNT(DISTINCT c.id) as total FROM customers c JOIN visits v ON v.customer_id = c.id ${whereClause}`,
  ).bind(...params).first<{ total: number }>()

  const rows = await c.env.DB.prepare(`
    SELECT c.id, c.first_name, c.last_name, c.phone, c.email,
           MAX(v.visit_date) as last_visit, COUNT(v.id) as total_visits
    FROM customers c JOIN visits v ON v.customer_id = c.id
    ${whereClause} GROUP BY c.id ORDER BY last_visit DESC LIMIT ? OFFSET ?
  `).bind(...params, pageSize, offset).all<Record<string, unknown>>()

  return c.json({
    customers: (rows.results || []).map((r) => ({
      id: r.id, firstName: r.first_name, lastName: r.last_name,
      phone: r.phone, email: r.email, lastVisit: r.last_visit, totalVisits: r.total_visits,
    })),
    total: countResult?.total || 0, page,
  })
})

// --- GET /admin/stores/:id/visits ---
admin.get('/stores/:id/visits', async (c) => {
  const { adminId } = c.get('admin')
  const storeId = c.req.param('id')
  const store = await getOwnedStore(c.env.DB, storeId, adminId)
  if (!store) return c.json({ error: 'Not found' }, 404)

  const dateFrom = c.req.query('dateFrom')
  const dateTo = c.req.query('dateTo')
  const therapistName = c.req.query('therapistName')
  const page = parseInt(c.req.query('page') || '1', 10) || 1
  const pageSize = Math.min(parseInt(c.req.query('pageSize') || '20', 10) || 20, 100)
  const offset = (page - 1) * pageSize

  let whereClause = 'WHERE v.store_id = ?'
  const params: unknown[] = [storeId]
  if (dateFrom) { whereClause += ' AND v.visit_date >= ?'; params.push(dateFrom) }
  if (dateTo) { whereClause += ' AND v.visit_date <= ?'; params.push(dateTo) }
  if (therapistName) { whereClause += ' AND v.therapist_name LIKE ?'; params.push(`%${therapistName}%`) }

  const countResult = await c.env.DB.prepare(`SELECT COUNT(*) as total FROM visits v ${whereClause}`).bind(...params).first<{ total: number }>()

  const rows = await c.env.DB.prepare(`
    SELECT v.*, c.first_name, c.last_name, c.phone, s.name as store_name FROM visits v
    JOIN customers c ON v.customer_id = c.id
    JOIN stores s ON v.store_id = s.id ${whereClause}
    ORDER BY v.visit_date DESC LIMIT ? OFFSET ?
  `).bind(...params, pageSize, offset).all<Record<string, unknown>>()

  return c.json({
    visits: (rows.results || []).map((v) => ({
      id: v.id, visitDate: v.visit_date, customerName: `${v.first_name} ${v.last_name}`,
      phone: v.phone, serviceType: v.service_type, therapistName: v.therapist_name,
      therapistSignedAt: v.therapist_signed_at, cancelledAt: v.cancelled_at,
      storeName: v.store_name,
    })),
    total: countResult?.total || 0, page,
  })
})

// --- GET /admin/stores/:id/export/customers ---
admin.get('/stores/:id/export/customers', async (c) => {
  const { adminId } = c.get('admin')
  const storeId = c.req.param('id')
  const store = await getOwnedStore(c.env.DB, storeId, adminId)
  if (!store) return c.json({ error: 'Not found' }, 404)

  const rows = await c.env.DB.prepare(`
    SELECT c.first_name || ' ' || c.last_name as name, c.phone, c.email, c.address, c.date_of_birth, c.gender,
           MAX(v.visit_date) as last_visit, COUNT(v.id) as total_visits
    FROM customers c JOIN visits v ON v.customer_id = c.id
    WHERE v.store_id = ? GROUP BY c.id ORDER BY last_visit DESC
  `).bind(storeId).all<Record<string, unknown>>()

  const csv = generateCustomersCsv(rows.results || [])
  return new Response(csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="customers.csv"' },
  })
})

// --- GET /admin/stores/:id/export/visits ---
admin.get('/stores/:id/export/visits', async (c) => {
  const { adminId } = c.get('admin')
  const storeId = c.req.param('id')
  const store = await getOwnedStore(c.env.DB, storeId, adminId)
  if (!store) return c.json({ error: 'Not found' }, 404)

  const dateFrom = c.req.query('dateFrom')
  const dateTo = c.req.query('dateTo')
  let whereClause = 'WHERE v.store_id = ?'
  const params: unknown[] = [storeId]
  if (dateFrom) { whereClause += ' AND v.visit_date >= ?'; params.push(dateFrom) }
  if (dateTo) { whereClause += ' AND v.visit_date <= ?'; params.push(dateTo) }

  const rows = await c.env.DB.prepare(`
    SELECT v.visit_date, c.first_name || ' ' || c.last_name as customer_name, c.phone,
           v.service_type, v.therapist_name,
           CASE WHEN v.therapist_signed_at IS NOT NULL THEN 'Yes' ELSE 'No' END as signed,
           CASE WHEN v.cancelled_at IS NOT NULL THEN 'Yes' ELSE 'No' END as cancelled
    FROM visits v JOIN customers c ON v.customer_id = c.id ${whereClause} ORDER BY v.visit_date DESC
  `).bind(...params).all<Record<string, unknown>>()

  const csv = generateVisitsCsv(rows.results || [])
  return new Response(csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="visits.csv"' },
  })
})

// --- GET /admin/customers/:id --- (customer detail for admin panel)
admin.get('/customers/:id', async (c) => {
  const { adminId } = c.get('admin')
  const customerId = c.req.param('id')
  // Verify this customer belongs to one of admin's stores via visits
  const ownership = await c.env.DB.prepare(
    'SELECT 1 FROM visits v JOIN stores s ON v.store_id = s.id WHERE v.customer_id = ? AND s.admin_id = ? LIMIT 1',
  ).bind(customerId, adminId).first()
  if (!ownership) return c.json({ error: 'Not found' }, 404)

  const row = await c.env.DB.prepare(
    'SELECT * FROM customers WHERE id = ?',
  ).bind(customerId).first<Record<string, unknown>>()
  if (!row) return c.json({ error: 'Not found' }, 404)

  return c.json({
    customer: {
      id: row.id, firstName: row.first_name, lastName: row.last_name,
      phone: row.phone, email: row.email, address: row.address,
      dateOfBirth: row.date_of_birth, gender: row.gender,
      emergencyContactName: row.emergency_contact_name,
      emergencyContactPhone: row.emergency_contact_phone,
      staffNotes: row.staff_notes, createdAt: row.created_at, updatedAt: row.updated_at,
    },
  })
})

// --- GET /admin/customers/:id/intake ---
admin.get('/customers/:id/intake', async (c) => {
  const { adminId } = c.get('admin')
  const customerId = c.req.param('id')
  const ownership = await c.env.DB.prepare(
    'SELECT 1 FROM visits v JOIN stores s ON v.store_id = s.id WHERE v.customer_id = ? AND s.admin_id = ? LIMIT 1',
  ).bind(customerId, adminId).first()
  if (!ownership) return c.json({ error: 'Not found' }, 404)

  const row = await c.env.DB.prepare(
    'SELECT * FROM intake_forms WHERE customer_id = ?',
  ).bind(customerId).first<Record<string, unknown>>()
  if (!row) return c.json({ intakeForm: null })

  return c.json({
    intakeForm: {
      id: row.id, customerId: row.customer_id, formVersion: row.form_version,
      formData: JSON.parse((row.form_data as string) || '{}'),
      status: row.status, clientSignedAt: row.client_signed_at,
      lastReviewedAt: row.last_reviewed_at, completedAt: row.completed_at,
      createdAt: row.created_at, updatedAt: row.updated_at,
    },
  })
})

// --- GET /admin/customers/:id/visits ---
admin.get('/customers/:id/visits', async (c) => {
  const { adminId } = c.get('admin')
  const customerId = c.req.param('id')
  const ownership = await c.env.DB.prepare(
    'SELECT 1 FROM visits v JOIN stores s ON v.store_id = s.id WHERE v.customer_id = ? AND s.admin_id = ? LIMIT 1',
  ).bind(customerId, adminId).first()
  if (!ownership) return c.json({ error: 'Not found' }, 404)

  const rows = await c.env.DB.prepare(`
    SELECT v.*, s.name as store_name FROM visits v
    JOIN stores s ON v.store_id = s.id
    WHERE v.customer_id = ? ORDER BY v.visit_date DESC
  `).bind(customerId).all<Record<string, unknown>>()

  return c.json({
    visits: (rows.results || []).map((v) => ({
      id: v.id, customerId: v.customer_id, storeId: v.store_id,
      visitDate: v.visit_date, serviceType: v.service_type,
      therapistName: v.therapist_name, storeName: v.store_name,
      therapistSignedAt: v.therapist_signed_at, cancelledAt: v.cancelled_at,
    })),
  })
})

// --- PATCH /admin/customers/:id/notes ---
admin.patch('/customers/:id/notes', async (c) => {
  const { adminId } = c.get('admin')
  const customerId = c.req.param('id')
  const ownership = await c.env.DB.prepare(
    'SELECT 1 FROM visits v JOIN stores s ON v.store_id = s.id WHERE v.customer_id = ? AND s.admin_id = ? LIMIT 1',
  ).bind(customerId, adminId).first()
  if (!ownership) return c.json({ error: 'Not found' }, 404)

  const body = await c.req.json<{ staffNotes: string }>()
  await c.env.DB.prepare(
    'UPDATE customers SET staff_notes = ? WHERE id = ?',
  ).bind(body.staffNotes, customerId).run()

  return c.json({ ok: true })
})

export default admin
