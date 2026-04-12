import { Hono } from 'hono'
import { z } from 'zod'
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

  // Show all customers across all admin's stores (global within account)
  let whereClause = 'WHERE s.admin_id = ?'
  const params: unknown[] = [adminId]
  if (search) { whereClause += ' AND (c.first_name LIKE ? OR c.last_name LIKE ? OR c.phone LIKE ?)'; const s = `%${search}%`; params.push(s, s, s) }
  if (lastVisitAfter) { whereClause += ' AND v.visit_date >= ?'; params.push(lastVisitAfter) }

  const countResult = await c.env.DB.prepare(
    `SELECT COUNT(DISTINCT c.id) as total FROM customers c JOIN visits v ON v.customer_id = c.id JOIN stores s ON v.store_id = s.id ${whereClause}`,
  ).bind(...params).first<{ total: number }>()

  const rows = await c.env.DB.prepare(`
    SELECT c.id, c.first_name, c.last_name, c.phone, c.email,
           MAX(v.visit_date) as last_visit, COUNT(v.id) as total_visits
    FROM customers c JOIN visits v ON v.customer_id = c.id
    JOIN stores s ON v.store_id = s.id
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

  // Show all visits across all admin's stores (global within account)
  let whereClause = 'WHERE s.admin_id = ?'
  const params: unknown[] = [adminId]
  if (dateFrom) { whereClause += ' AND v.visit_date >= ?'; params.push(dateFrom) }
  if (dateTo) { whereClause += ' AND v.visit_date <= ?'; params.push(dateTo) }
  if (therapistName) { whereClause += ' AND v.therapist_name LIKE ?'; params.push(`%${therapistName}%`) }

  const countResult = await c.env.DB.prepare(
    `SELECT COUNT(*) as total FROM visits v JOIN stores s ON v.store_id = s.id ${whereClause}`,
  ).bind(...params).first<{ total: number }>()

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
      therapistServiceTechnique: v.therapist_service_technique ?? null,
      therapistSignedAt: v.therapist_signed_at, pointsRedeemed: v.points_redeemed ?? 0, pointsAfter: v.points_after ?? null,
      cancelledAt: v.cancelled_at, storeName: v.store_name,
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
      staffNotes: row.staff_notes, loyaltyPoints: row.loyalty_points ?? 0, loyaltyImportedAt: row.loyalty_imported_at ?? null,
      createdAt: row.created_at, updatedAt: row.updated_at,
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
      therapistServiceTechnique: v.therapist_service_technique ?? null,
      therapistSignedAt: v.therapist_signed_at, pointsRedeemed: v.points_redeemed ?? 0, pointsAfter: v.points_after ?? null,
      cancelledAt: v.cancelled_at,
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

// --- PATCH /admin/customers/:id/loyalty-points (admin modify with PIN) ---
admin.patch('/customers/:id/loyalty-points', async (c) => {
  const { adminId } = c.get('admin')
  const customerId = c.req.param('id')

  const parsed = z.object({
    loyaltyPoints: z.number().int().min(0),
    pin: z.string().min(1),
  }).safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: 'Invalid input' }, 400)
  const { loyaltyPoints, pin } = parsed.data

  // Verify customer belongs to admin
  const ownership = await c.env.DB.prepare(
    'SELECT 1 FROM visits v JOIN stores s ON v.store_id = s.id WHERE v.customer_id = ? AND s.admin_id = ? LIMIT 1',
  ).bind(customerId, adminId).first()
  if (!ownership) return c.json({ error: 'Not found' }, 404)

  // Verify PIN against any of admin's stores
  const stores = await c.env.DB.prepare(
    'SELECT admin_pin_hash FROM stores WHERE admin_id = ?',
  ).bind(adminId).all<{ admin_pin_hash: string }>()

  let pinValid = false
  for (const store of stores.results || []) {
    if (await verifyHash(pin, store.admin_pin_hash)) {
      pinValid = true
      break
    }
  }
  if (!pinValid) return c.json({ error: 'PIN incorrect' }, 403)

  await c.env.DB.prepare(
    'UPDATE customers SET loyalty_points = ? WHERE id = ?',
  ).bind(loyaltyPoints, customerId).run()

  return c.json({ loyaltyPoints })
})

// ============================================================================
// Account-level Analytics (cross-store, scoped to admin's stores)
// ============================================================================

// --- GET /admin/analytics/store-comparison?period=month|year ---
// Monthly visit counts per store for comparison
admin.get('/analytics/store-comparison', async (c) => {
  const { adminId } = c.get('admin')
  const period = c.req.query('period') || 'year'

  // Get first store's timezone for local time calculation
  const tzRow = await c.env.DB.prepare('SELECT timezone FROM stores WHERE admin_id = ? LIMIT 1').bind(adminId).first<{ timezone: string }>()
  const tz = tzRow?.timezone || 'America/Chicago'
  const nowUtc = new Date()
  const localStr = nowUtc.toLocaleString('en-CA', { timeZone: tz, hour12: false })
  const now = new Date(localStr.replace(',', ''))
  const offsetMs = new Date(nowUtc.toLocaleString('en-US', { timeZone: tz })).getTime() - new Date(nowUtc.toLocaleString('en-US', { timeZone: 'UTC' })).getTime()
  const offsetHours = Math.round(offsetMs / 3600000)
  const offsetSql = `${offsetHours >= 0 ? '+' : ''}${offsetHours} hours`
  const localVisit = `datetime(v.visit_date, '${offsetSql}')`

  const year = now.getFullYear()
  const pad = (n: number) => String(n).padStart(2, '0')

  let dateFilter: string
  let groupBy: string
  let allSlots: string[]

  if (period === 'month') {
    const m = now.getMonth() + 1
    const daysInMonth = new Date(year, m, 0).getDate()
    const monthPrefix = `${year}-${pad(m)}`
    groupBy = `date(${localVisit})`
    dateFilter = `AND strftime('%Y-%m', ${localVisit}) = '${monthPrefix}'`
    allSlots = Array.from({ length: daysInMonth }, (_, i) => `${monthPrefix}-${pad(i + 1)}`)
  } else {
    groupBy = `strftime('%Y-%m', ${localVisit})`
    dateFilter = `AND strftime('%Y', ${localVisit}) = '${year}'`
    allSlots = Array.from({ length: 12 }, (_, i) => `${year}-${pad(i + 1)}`)
  }

  // Get all stores
  const stores = await c.env.DB.prepare(
    'SELECT id, name FROM stores WHERE admin_id = ? ORDER BY created_at ASC',
  ).bind(adminId).all<{ id: string; name: string }>()

  // Get visit counts grouped by store + time slot
  const rows = await c.env.DB.prepare(`
    SELECT v.store_id, ${groupBy} as label, COUNT(*) as total
    FROM visits v JOIN stores s ON v.store_id = s.id
    WHERE s.admin_id = ? ${dateFilter}
    GROUP BY v.store_id, label ORDER BY label ASC
  `).bind(adminId).all<{ store_id: string; label: string; total: number }>()

  // Build per-store data with all slots filled
  const dataMap = new Map<string, Map<string, number>>()
  for (const r of rows.results || []) {
    if (!dataMap.has(r.store_id)) dataMap.set(r.store_id, new Map())
    dataMap.get(r.store_id)!.set(r.label, r.total)
  }

  const storeList = (stores.results || []).map((s) => {
    const storeData = dataMap.get(s.id) ?? new Map()
    return {
      storeId: s.id,
      storeName: s.name,
      data: allSlots.map((slot) => ({ label: slot, total: storeData.get(slot) ?? 0 })),
    }
  })

  return c.json({ stores: storeList, slots: allSlots })
})

// --- GET /admin/analytics/customers-overview ---
// Total customers, new this month, cross-store customers, monthly new customer trend
admin.get('/analytics/customers-overview', async (c) => {
  const { adminId } = c.get('admin')
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const pad = (n: number) => String(n).padStart(2, '0')
  const monthPrefix = `${year}-${pad(month)}`

  // Total unique customers across admin's stores
  const totalResult = await c.env.DB.prepare(`
    SELECT COUNT(DISTINCT v.customer_id) as total
    FROM visits v JOIN stores s ON v.store_id = s.id WHERE s.admin_id = ?
  `).bind(adminId).first<{ total: number }>()

  // New customers this month
  const newResult = await c.env.DB.prepare(`
    SELECT COUNT(*) as cnt FROM customers
    WHERE strftime('%Y-%m', created_at) = ? AND id IN (
      SELECT DISTINCT v.customer_id FROM visits v JOIN stores s ON v.store_id = s.id WHERE s.admin_id = ?
    )
  `).bind(monthPrefix, adminId).first<{ cnt: number }>()

  // Cross-store customers (visited 2+ stores)
  const crossResult = await c.env.DB.prepare(`
    SELECT COUNT(*) as cnt FROM (
      SELECT v.customer_id FROM visits v JOIN stores s ON v.store_id = s.id
      WHERE s.admin_id = ? GROUP BY v.customer_id HAVING COUNT(DISTINCT v.store_id) >= 2
    )
  `).bind(adminId).first<{ cnt: number }>()

  // Monthly new customer trend (this year)
  const trendRows = await c.env.DB.prepare(`
    SELECT strftime('%Y-%m', c.created_at) as month, COUNT(*) as cnt
    FROM customers c
    WHERE strftime('%Y', c.created_at) = ? AND c.id IN (
      SELECT DISTINCT v.customer_id FROM visits v JOIN stores s ON v.store_id = s.id WHERE s.admin_id = ?
    )
    GROUP BY month ORDER BY month ASC
  `).bind(String(year), adminId).all<{ month: string; cnt: number }>()

  const trendMap = new Map((trendRows.results || []).map((r) => [r.month, r.cnt]))
  const newCustomerTrend = Array.from({ length: 12 }, (_, i) => {
    const m = `${year}-${pad(i + 1)}`
    return { month: m, count: trendMap.get(m) ?? 0 }
  })

  const totalCustomers = totalResult?.total ?? 0
  const crossStore = crossResult?.cnt ?? 0

  return c.json({
    totalCustomers,
    newThisMonth: newResult?.cnt ?? 0,
    crossStoreCustomers: crossStore,
    crossStoreRate: totalCustomers > 0 ? Math.round((crossStore / totalCustomers) * 1000) / 10 : 0,
    newCustomerTrend,
  })
})

// --- GET /admin/analytics/points-overview ---
// Loyalty points system overview across all stores
admin.get('/analytics/points-overview', async (c) => {
  const { adminId } = c.get('admin')
  const now = new Date()
  const year = now.getFullYear()
  const pad = (n: number) => String(n).padStart(2, '0')

  // Total points issued (completed visits) and redeemed this year
  const stats = await c.env.DB.prepare(`
    SELECT
      SUM(CASE WHEN v.therapist_signed_at IS NOT NULL THEN 1 ELSE 0 END) as totalIssued,
      SUM(CASE WHEN v.points_redeemed > 0 THEN 1 ELSE 0 END) as totalRedeemed
    FROM visits v JOIN stores s ON v.store_id = s.id
    WHERE s.admin_id = ? AND strftime('%Y', v.visit_date) = ?
  `).bind(adminId, String(year)).first<{ totalIssued: number; totalRedeemed: number }>()

  // Per-store redemption
  const storeRedeemed = await c.env.DB.prepare(`
    SELECT s.name, SUM(CASE WHEN v.points_redeemed > 0 THEN 1 ELSE 0 END) as redeemed
    FROM visits v JOIN stores s ON v.store_id = s.id
    WHERE s.admin_id = ? AND strftime('%Y', v.visit_date) = ?
    GROUP BY s.id ORDER BY redeemed DESC
  `).bind(adminId, String(year)).all<{ name: string; redeemed: number }>()

  // Monthly redemption trend
  const monthlyRows = await c.env.DB.prepare(`
    SELECT strftime('%Y-%m', v.visit_date) as month,
           SUM(CASE WHEN v.points_redeemed > 0 THEN 1 ELSE 0 END) as redeemed
    FROM visits v JOIN stores s ON v.store_id = s.id
    WHERE s.admin_id = ? AND strftime('%Y', v.visit_date) = ?
    GROUP BY month ORDER BY month ASC
  `).bind(adminId, String(year)).all<{ month: string; redeemed: number }>()

  const monthMap = new Map((monthlyRows.results || []).map((r) => [r.month, r.redeemed]))
  const redemptionByMonth = Array.from({ length: 12 }, (_, i) => {
    const m = `${year}-${pad(i + 1)}`
    const count = monthMap.get(m) ?? 0
    return { month: m, count, amount: count * 50 }
  })

  return c.json({
    totalIssued: stats?.totalIssued ?? 0,
    totalRedeemed: stats?.totalRedeemed ?? 0,
    totalRedeemedAmount: (stats?.totalRedeemed ?? 0) * 50,
    storeRedemptions: (storeRedeemed.results || []).map((r) => ({
      name: r.name, count: r.redeemed, amount: r.redeemed * 50,
    })),
    redemptionByMonth,
  })
})

// --- GET /admin/analytics/service-overview ---
// Global F/B/C breakdown + per-store cancellation rates
admin.get('/analytics/service-overview', async (c) => {
  const { adminId } = c.get('admin')
  const now = new Date()
  const year = String(now.getFullYear())

  // Global F/B/C
  const fbc = await c.env.DB.prepare(`
    SELECT
      SUM(CASE WHEN UPPER(SUBSTR(TRIM(v.therapist_service_technique), 1, 1)) = 'F' THEN 1 ELSE 0 END) as foot,
      SUM(CASE WHEN UPPER(SUBSTR(TRIM(v.therapist_service_technique), 1, 1)) = 'B' THEN 1 ELSE 0 END) as body,
      SUM(CASE WHEN UPPER(SUBSTR(TRIM(v.therapist_service_technique), 1, 1)) = 'C' THEN 1 ELSE 0 END) as combo,
      SUM(CASE WHEN UPPER(SUBSTR(TRIM(v.therapist_service_technique), 1, 1)) = 'A' THEN 1 ELSE 0 END) as chair,
      COUNT(*) as total
    FROM visits v JOIN stores s ON v.store_id = s.id
    WHERE s.admin_id = ? AND v.therapist_signed_at IS NOT NULL AND strftime('%Y', v.visit_date) = ?
  `).bind(adminId, year).first<{ foot: number; body: number; combo: number; chair: number; total: number }>()

  // Per-store cancellation rates
  const cancelRows = await c.env.DB.prepare(`
    SELECT s.name,
           COUNT(*) as total,
           SUM(CASE WHEN v.cancelled_at IS NOT NULL THEN 1 ELSE 0 END) as cancelled
    FROM visits v JOIN stores s ON v.store_id = s.id
    WHERE s.admin_id = ? AND strftime('%Y', v.visit_date) = ?
    GROUP BY s.id ORDER BY s.name ASC
  `).bind(adminId, year).all<{ name: string; total: number; cancelled: number }>()

  return c.json({
    serviceBreakdown: {
      foot: fbc?.foot ?? 0, body: fbc?.body ?? 0, combo: fbc?.combo ?? 0, chair: fbc?.chair ?? 0, total: fbc?.total ?? 0,
    },
    storeCancellationRates: (cancelRows.results || []).map((r) => ({
      name: r.name, total: r.total, cancelled: r.cancelled,
      rate: r.total > 0 ? Math.round((r.cancelled / r.total) * 1000) / 10 : 0,
    })),
  })
})

// --- GET /admin/analytics/top-customers ---
// Top 5 most frequent customers this year (account-level, all stores)
admin.get('/analytics/top-customers', async (c) => {
  const { adminId } = c.get('admin')
  const year = String(new Date().getFullYear())

  const rows = await c.env.DB.prepare(`
    SELECT c.id, c.first_name, c.last_name, c.phone,
           COUNT(*) as visit_count,
           SUM(CASE WHEN UPPER(SUBSTR(TRIM(v.therapist_service_technique), 1, 1)) = 'F' THEN 1 ELSE 0 END) as foot,
           SUM(CASE WHEN UPPER(SUBSTR(TRIM(v.therapist_service_technique), 1, 1)) = 'B' THEN 1 ELSE 0 END) as body,
           SUM(CASE WHEN UPPER(SUBSTR(TRIM(v.therapist_service_technique), 1, 1)) = 'C' THEN 1 ELSE 0 END) as combo,
           SUM(CASE WHEN UPPER(SUBSTR(TRIM(v.therapist_service_technique), 1, 1)) = 'A' THEN 1 ELSE 0 END) as chair
    FROM visits v
    JOIN customers c ON v.customer_id = c.id
    JOIN stores s ON v.store_id = s.id
    WHERE s.admin_id = ? AND v.therapist_signed_at IS NOT NULL AND strftime('%Y', v.visit_date) = ?
    GROUP BY c.id ORDER BY visit_count DESC LIMIT 5
  `).bind(adminId, year).all<{
    id: string; first_name: string; last_name: string; phone: string;
    visit_count: number; foot: number; body: number; combo: number; chair: number
  }>()

  // Per-store breakdown for each top customer
  const topIds = (rows.results || []).map((r) => r.id)
  let storeBreakdowns: Record<string, { storeName: string; count: number }[]> = {}
  if (topIds.length > 0) {
    const placeholders = topIds.map(() => '?').join(',')
    const storeRows = await c.env.DB.prepare(`
      SELECT v.customer_id, s.name as store_name, COUNT(*) as cnt
      FROM visits v JOIN stores s ON v.store_id = s.id
      WHERE s.admin_id = ? AND v.therapist_signed_at IS NOT NULL
        AND strftime('%Y', v.visit_date) = ? AND v.customer_id IN (${placeholders})
      GROUP BY v.customer_id, s.id ORDER BY cnt DESC
    `).bind(adminId, year, ...topIds).all<{ customer_id: string; store_name: string; cnt: number }>()

    for (const r of storeRows.results || []) {
      if (!storeBreakdowns[r.customer_id]) storeBreakdowns[r.customer_id] = []
      storeBreakdowns[r.customer_id].push({ storeName: r.store_name, count: r.cnt })
    }
  }

  return c.json({
    customers: (rows.results || []).map((r) => ({
      id: r.id, name: `${r.first_name} ${r.last_name}`, phone: r.phone,
      visitCount: r.visit_count, foot: r.foot, body: r.body, combo: r.combo, chair: r.chair,
      storeBreakdown: storeBreakdowns[r.id] ?? [],
    })),
  })
})

export default admin
