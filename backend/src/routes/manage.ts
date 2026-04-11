import { Hono } from 'hono'
import { z } from 'zod'
import { verifyHash } from '../lib/hash'
import { generateCustomersCsv, generateVisitsCsv } from '../lib/csv'

type Bindings = { DB: D1Database; JWT_SECRET: string }
type Session = { storeId: string; role: string; sessionId: string; sessionStartAt: string }

const manage = new Hono<{ Bindings: Bindings; Variables: { session: Session } }>()

// --- GET /manage/customers ---
manage.get('/customers', async (c) => {
  const session = c.get('session')
  const search = c.req.query('search') || ''
  const page = parseInt(c.req.query('page') || '1', 10)
  const pageSize = Math.min(parseInt(c.req.query('pageSize') || '20', 10) || 20, 100)
  const offset = (page - 1) * pageSize

  // Look up admin_id from current store to show all admin's customers globally
  const store = await c.env.DB.prepare('SELECT admin_id FROM stores WHERE id = ?').bind(session.storeId).first<{ admin_id: string }>()
  if (!store) return c.json({ error: 'Store not found' }, 404)

  let whereClause = 'WHERE s.admin_id = ?'
  const params: unknown[] = [store.admin_id]

  if (search) {
    whereClause += " AND (c.first_name LIKE ? OR c.last_name LIKE ? OR c.phone LIKE ?)"
    const s = `%${search}%`
    params.push(s, s, s)
  }

  const countResult = await c.env.DB.prepare(
    `SELECT COUNT(DISTINCT c.id) as total FROM customers c JOIN visits v ON v.customer_id = c.id JOIN stores s ON v.store_id = s.id ${whereClause}`,
  ).bind(...params).first<{ total: number }>()

  const rows = await c.env.DB.prepare(`
    SELECT c.id, c.first_name, c.last_name, c.phone, c.email,
           MAX(v.visit_date) as last_visit, COUNT(v.id) as total_visits
    FROM customers c
    JOIN visits v ON v.customer_id = c.id
    JOIN stores s ON v.store_id = s.id
    ${whereClause}
    GROUP BY c.id
    ORDER BY last_visit DESC
    LIMIT ? OFFSET ?
  `).bind(...params, pageSize, offset).all<Record<string, unknown>>()

  return c.json({
    customers: (rows.results || []).map((r) => ({
      id: r.id, firstName: r.first_name, lastName: r.last_name,
      phone: r.phone, email: r.email, lastVisit: r.last_visit, totalVisits: r.total_visits,
    })),
    total: countResult?.total || 0,
    page,
  })
})

// --- GET /manage/visits ---
manage.get('/visits', async (c) => {
  const session = c.get('session')
  const dateFrom = c.req.query('dateFrom')
  const dateTo = c.req.query('dateTo')
  const therapistName = c.req.query('therapistName')
  const page = parseInt(c.req.query('page') || '1', 10)
  const pageSize = Math.min(parseInt(c.req.query('pageSize') || '20', 10) || 20, 100)
  const offset = (page - 1) * pageSize

  // Look up admin_id from current store to show all admin's visits globally
  const store = await c.env.DB.prepare('SELECT admin_id FROM stores WHERE id = ?').bind(session.storeId).first<{ admin_id: string }>()
  if (!store) return c.json({ error: 'Store not found' }, 404)

  let whereClause = 'WHERE s.admin_id = ?'
  const params: unknown[] = [store.admin_id]

  if (dateFrom) { whereClause += ' AND v.visit_date >= ?'; params.push(dateFrom) }
  if (dateTo) { whereClause += ' AND v.visit_date <= ?'; params.push(dateTo) }
  if (therapistName) { whereClause += ' AND v.therapist_name LIKE ?'; params.push(`%${therapistName}%`) }

  const countResult = await c.env.DB.prepare(
    `SELECT COUNT(*) as total FROM visits v JOIN stores s ON v.store_id = s.id ${whereClause}`,
  ).bind(...params).first<{ total: number }>()

  const rows = await c.env.DB.prepare(`
    SELECT v.*, c.first_name, c.last_name, c.phone, s.name as store_name
    FROM visits v
    JOIN customers c ON v.customer_id = c.id
    JOIN stores s ON v.store_id = s.id
    ${whereClause} ORDER BY v.visit_date DESC LIMIT ? OFFSET ?
  `).bind(...params, pageSize, offset).all<Record<string, unknown>>()

  return c.json({
    visits: (rows.results || []).map((v) => ({
      id: v.id, visitDate: v.visit_date, customerName: `${v.first_name} ${v.last_name}`,
      phone: v.phone, serviceType: v.service_type, therapistName: v.therapist_name,
      therapistServiceTechnique: v.therapist_service_technique ?? null,
      therapistSignedAt: v.therapist_signed_at, pointsRedeemed: v.points_redeemed ?? 0, pointsAfter: v.points_after ?? null,
      cancelledAt: v.cancelled_at,
      storeName: v.store_name,
    })),
    total: countResult?.total || 0,
    page,
  })
})

// --- GET /manage/export/customers ---
manage.get('/export/customers', async (c) => {
  const session = c.get('session')
  const rows = await c.env.DB.prepare(`
    SELECT c.first_name || ' ' || c.last_name as name, c.phone, c.email, c.address, c.date_of_birth, c.gender,
           MAX(v.visit_date) as last_visit, COUNT(v.id) as total_visits
    FROM customers c JOIN visits v ON v.customer_id = c.id
    WHERE v.store_id = ? GROUP BY c.id ORDER BY last_visit DESC
  `).bind(session.storeId).all<Record<string, unknown>>()

  const csv = generateCustomersCsv(rows.results || [])
  return new Response(csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="customers.csv"' },
  })
})

// --- GET /manage/export/visits ---
manage.get('/export/visits', async (c) => {
  const session = c.get('session')
  const dateFrom = c.req.query('dateFrom')
  const dateTo = c.req.query('dateTo')

  let whereClause = 'WHERE v.store_id = ?'
  const params: unknown[] = [session.storeId]
  if (dateFrom) { whereClause += ' AND v.visit_date >= ?'; params.push(dateFrom) }
  if (dateTo) { whereClause += ' AND v.visit_date <= ?'; params.push(dateTo) }

  const rows = await c.env.DB.prepare(`
    SELECT v.visit_date, c.first_name || ' ' || c.last_name as customer_name, c.phone,
           v.service_type, v.therapist_name,
           CASE WHEN v.therapist_signed_at IS NOT NULL THEN 'Yes' ELSE 'No' END as signed,
           CASE WHEN v.cancelled_at IS NOT NULL THEN 'Yes' ELSE 'No' END as cancelled
    FROM visits v JOIN customers c ON v.customer_id = c.id
    ${whereClause} ORDER BY v.visit_date DESC
  `).bind(...params).all<Record<string, unknown>>()

  const csv = generateVisitsCsv(rows.results || [])
  return new Response(csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="visits.csv"' },
  })
})

// --- GET /manage/export/forms?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD ---
// Returns customer + intake form data for all customers who visited in the date range.
// Date filtering uses store timezone so the range matches local calendar dates.
manage.get('/export/forms', async (c) => {
  const session = c.get('session')
  const dateFrom = c.req.query('dateFrom')
  const dateTo = c.req.query('dateTo')
  if (!dateFrom || !dateTo) return c.json({ error: 'dateFrom and dateTo are required' }, 400)
  const datePattern = /^\d{4}-\d{2}-\d{2}$/
  if (!datePattern.test(dateFrom) || !datePattern.test(dateTo)) {
    return c.json({ error: 'Invalid date format, expected YYYY-MM-DD' }, 400)
  }

  // Get store timezone for local time calculation
  const storeRow = await c.env.DB.prepare('SELECT name, timezone FROM stores WHERE id = ?')
    .bind(session.storeId).first<{ name: string; timezone: string }>()
  const tz = storeRow?.timezone || 'America/Chicago'
  const storeName = storeRow?.name || ''

  // Compute UTC offset for store timezone (same pattern as analytics)
  const nowUtc = new Date()
  const offsetMs = nowUtc.getTime() - new Date(nowUtc.toLocaleString('en-US', { timeZone: 'UTC' })).getTime()
    + new Date(nowUtc.toLocaleString('en-US', { timeZone: tz })).getTime()
    - nowUtc.getTime()
  const offsetHours = Math.round(offsetMs / 3600000)
  const offsetStr = `${offsetHours >= 0 ? '+' : ''}${offsetHours} hours`
  const localVisit = `datetime(v.visit_date, '${offsetStr}')`

  // Find distinct customers who visited in the date range (local time)
  const rows = await c.env.DB.prepare(`
    SELECT DISTINCT c.*, if2.id as intake_id, if2.form_data, if2.status as intake_status,
           if2.client_signed_at, if2.last_reviewed_at,
           (SELECT COUNT(*) FROM visits WHERE customer_id = c.id AND store_id = ?) as total_visits
    FROM customers c
    JOIN visits v ON v.customer_id = c.id AND v.store_id = ?
    LEFT JOIN intake_forms if2 ON if2.customer_id = c.id
    WHERE date(${localVisit}) >= ? AND date(${localVisit}) <= ?
      AND v.cancelled_at IS NULL
    ORDER BY c.last_name, c.first_name
  `).bind(session.storeId, session.storeId, dateFrom, dateTo).all<Record<string, unknown>>()

  const customers = (rows.results || []).map((r) => {
    let formData: Record<string, unknown> = {}
    try { formData = JSON.parse((r.form_data as string) || '{}') } catch { /* empty */ }

    return {
      storeName,
      firstName: r.first_name as string,
      lastName: r.last_name as string,
      phone: r.phone as string,
      email: r.email as string | null,
      dateOfBirth: r.date_of_birth as string | null,
      address: r.address as string | null,
      gender: r.gender as string | null,
      emergencyContactName: r.emergency_contact_name as string | null,
      emergencyContactPhone: r.emergency_contact_phone as string | null,
      hasIntake: !!r.intake_id,
      intakeStatus: r.intake_status as string | null,
      clientSignedAt: r.client_signed_at as string | null,
      lastReviewedAt: r.last_reviewed_at as string | null,
      totalVisits: r.total_visits as number,
      formData,
    }
  })

  return c.json({ customers, storeName })
})

// Helper: get admin_id from current store session
async function getAdminId(db: D1Database, storeId: string): Promise<string | null> {
  const store = await db.prepare('SELECT admin_id FROM stores WHERE id = ?').bind(storeId).first<{ admin_id: string }>()
  return store?.admin_id ?? null
}

// --- GET /manage/customers/:id --- (customer detail — global)
manage.get('/customers/:id', async (c) => {
  const session = c.get('session')
  const customerId = c.req.param('id')

  const customer = await c.env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(customerId).first<Record<string, unknown>>()
  if (!customer) return c.json({ error: 'Customer not found' }, 404)

  return c.json({
    customer: {
      id: customer.id, firstName: customer.first_name, lastName: customer.last_name,
      phone: customer.phone, email: customer.email, address: customer.address,
      dateOfBirth: customer.date_of_birth, gender: customer.gender,
      emergencyContactName: customer.emergency_contact_name,
      emergencyContactPhone: customer.emergency_contact_phone,
      staffNotes: customer.staff_notes, loyaltyPoints: customer.loyalty_points ?? 0,
      loyaltyImportedAt: customer.loyalty_imported_at ?? null,
      createdAt: customer.created_at, updatedAt: customer.updated_at,
    },
  })
})

// --- GET /manage/customers/:id/intake ---
manage.get('/customers/:id/intake', async (c) => {
  const customerId = c.req.param('id')
  const row = await c.env.DB.prepare('SELECT * FROM intake_forms WHERE customer_id = ?').bind(customerId).first<Record<string, unknown>>()
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

// --- GET /manage/customers/:id/visits --- (all stores)
manage.get('/customers/:id/visits', async (c) => {
  const session = c.get('session')
  const customerId = c.req.param('id')
  const adminId = await getAdminId(c.env.DB, session.storeId)
  if (!adminId) return c.json({ error: 'Store not found' }, 404)

  const rows = await c.env.DB.prepare(`
    SELECT v.*, s.name as store_name FROM visits v
    JOIN stores s ON v.store_id = s.id
    WHERE v.customer_id = ? AND s.admin_id = ? ORDER BY v.visit_date DESC
  `).bind(customerId, adminId).all<Record<string, unknown>>()

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

// --- PATCH /manage/customers/:id/notes ---
manage.patch('/customers/:id/notes', async (c) => {
  const customerId = c.req.param('id')
  const body = await c.req.json<{ staffNotes: string }>()
  const customer = await c.env.DB.prepare('SELECT id FROM customers WHERE id = ?').bind(customerId).first()
  if (!customer) return c.json({ error: 'Customer not found' }, 404)

  await c.env.DB.prepare('UPDATE customers SET staff_notes = ? WHERE id = ?').bind(body.staffNotes, customerId).run()
  return c.json({ ok: true })
})

// --- PATCH /manage/customers/:id/loyalty-points (modify with admin PIN) ---
manage.patch('/customers/:id/loyalty-points', async (c) => {
  const session = c.get('session')
  const customerId = c.req.param('id')

  const parsed = z.object({
    loyaltyPoints: z.number().int().min(0),
    pin: z.string().min(1),
  }).safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: 'Invalid input' }, 400)
  const { loyaltyPoints, pin } = parsed.data

  // Verify customer exists
  const customer = await c.env.DB.prepare('SELECT id FROM customers WHERE id = ?').bind(customerId).first()
  if (!customer) return c.json({ error: 'Customer not found' }, 404)

  // Verify customer belongs to admin's stores
  const adminId = await getAdminId(c.env.DB, session.storeId)
  if (adminId) {
    const ownership = await c.env.DB.prepare(
      'SELECT 1 FROM visits v JOIN stores s ON v.store_id = s.id WHERE v.customer_id = ? AND s.admin_id = ? LIMIT 1',
    ).bind(customerId, adminId).first()
    if (!ownership) return c.json({ error: 'Not found' }, 404)
  }

  // Verify admin PIN for current store
  const store = await c.env.DB.prepare(
    'SELECT admin_pin_hash FROM stores WHERE id = ?',
  ).bind(session.storeId).first<{ admin_pin_hash: string }>()
  if (!store || !(await verifyHash(pin, store.admin_pin_hash))) {
    return c.json({ error: 'PIN incorrect' }, 403)
  }

  await c.env.DB.prepare(
    'UPDATE customers SET loyalty_points = ? WHERE id = ?',
  ).bind(loyaltyPoints, customerId).run()

  return c.json({ loyaltyPoints })
})

// ============================================================================
// Analytics endpoints (store-level, scoped to current store)
// ============================================================================

// --- GET /manage/analytics/visit-trend?period=day|week|month|year ---
// day  = today by hour (0-23)
// week = this week by day (Mon-Sun)
// month = this month by day (1-31)
// year = this year by month (Jan-Dec)
manage.get('/analytics/visit-trend', async (c) => {
  const session = c.get('session')
  const period = c.req.query('period') || 'day'

  // Get store timezone for local time calculation
  const storeRow = await c.env.DB.prepare('SELECT timezone FROM stores WHERE id = ?').bind(session.storeId).first<{ timezone: string }>()
  const tz = storeRow?.timezone || 'America/Chicago'

  // Compute "now" in store's local timezone
  const nowUtc = new Date()
  const localStr = nowUtc.toLocaleString('en-CA', { timeZone: tz, hour12: false })
  const now = new Date(localStr.replace(',', ''))

  // SQLite offset string for converting UTC visit_date to local
  const offsetMs = nowUtc.getTime() - new Date(nowUtc.toLocaleString('en-US', { timeZone: 'UTC' })).getTime()
    + new Date(nowUtc.toLocaleString('en-US', { timeZone: tz })).getTime()
    - nowUtc.getTime()
  const offsetHours = Math.round(offsetMs / 3600000)
  const offsetStr = `${offsetHours >= 0 ? '+' : ''}${offsetHours} hours`
  // localVisit converts UTC visit_date to store local time in SQL
  const localVisit = `datetime(v.visit_date, '${offsetStr}')`

  let groupBy: string
  let dateFilter: string
  let allSlots: string[]

  const pad = (n: number) => String(n).padStart(2, '0')

  switch (period) {
    case 'week': {
      // This week (Monday=1 to Sunday=7)
      const dayOfWeek = now.getDay() || 7 // convert Sunday=0 to 7
      const monday = new Date(now)
      monday.setDate(now.getDate() - dayOfWeek + 1)
      const mondayStr = `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)
      const sundayStr = `${sunday.getFullYear()}-${pad(sunday.getMonth() + 1)}-${pad(sunday.getDate())}`
      groupBy = `date(${localVisit})`
      dateFilter = `AND date(${localVisit}) >= '${mondayStr}' AND date(${localVisit}) <= '${sundayStr}'`
      allSlots = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday)
        d.setDate(monday.getDate() + i)
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      })
      break
    }
    case 'month': {
      // This month by day
      const y = now.getFullYear()
      const m = now.getMonth() + 1
      const daysInMonth = new Date(y, m, 0).getDate()
      const monthPrefix = `${y}-${pad(m)}`
      groupBy = `date(${localVisit})`
      dateFilter = `AND strftime('%Y-%m', ${localVisit}) = '${monthPrefix}'`
      allSlots = Array.from({ length: daysInMonth }, (_, i) => `${monthPrefix}-${pad(i + 1)}`)
      break
    }
    case 'year': {
      // This year by month
      const y = now.getFullYear()
      groupBy = `strftime('%Y-%m', ${localVisit})`
      dateFilter = `AND strftime('%Y', ${localVisit}) = '${y}'`
      allSlots = Array.from({ length: 12 }, (_, i) => `${y}-${pad(i + 1)}`)
      break
    }
    default: {
      // Today by hour
      const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
      groupBy = `strftime('%H', ${localVisit})`
      dateFilter = `AND date(${localVisit}) = '${today}'`
      allSlots = Array.from({ length: 24 }, (_, i) => pad(i))
      break
    }
  }

  const rows = await c.env.DB.prepare(`
    SELECT ${groupBy} as label,
           COUNT(*) as total,
           SUM(CASE WHEN v.therapist_signed_at IS NOT NULL THEN 1 ELSE 0 END) as completed,
           SUM(CASE WHEN v.cancelled_at IS NOT NULL THEN 1 ELSE 0 END) as cancelled
    FROM visits v
    WHERE v.store_id = ? ${dateFilter}
    GROUP BY ${groupBy}
    ORDER BY label ASC
  `).bind(session.storeId).all<{
    label: string; total: number; completed: number; cancelled: number
  }>()

  // Merge DB results into pre-filled slots (ensures no gaps)
  const dataMap = new Map((rows.results || []).map((r) => [r.label, r]))
  const trend = allSlots.map((slot) => {
    const row = dataMap.get(slot)
    return {
      label: slot,
      total: row?.total ?? 0,
      completed: row?.completed ?? 0,
      cancelled: row?.cancelled ?? 0,
    }
  })

  return c.json({ trend })
})

// --- GET /manage/analytics/service-breakdown?period=week|month|year ---
manage.get('/analytics/service-breakdown', async (c) => {
  const session = c.get('session')
  const period = c.req.query('period') || 'month'

  let dateFilter: string
  switch (period) {
    case 'week':
      dateFilter = "AND v.visit_date >= datetime('now', '-7 days')"
      break
    case 'year':
      dateFilter = "AND v.visit_date >= datetime('now', '-365 days')"
      break
    default: // month
      dateFilter = "AND v.visit_date >= datetime('now', '-30 days')"
      break
  }

  // Match F/B/C from therapist_service_technique (case-insensitive first letter)
  const rows = await c.env.DB.prepare(`
    SELECT
      SUM(CASE WHEN UPPER(SUBSTR(TRIM(v.therapist_service_technique), 1, 1)) = 'F' THEN 1 ELSE 0 END) as foot,
      SUM(CASE WHEN UPPER(SUBSTR(TRIM(v.therapist_service_technique), 1, 1)) = 'B' THEN 1 ELSE 0 END) as body,
      SUM(CASE WHEN UPPER(SUBSTR(TRIM(v.therapist_service_technique), 1, 1)) = 'C' THEN 1 ELSE 0 END) as combo,
      COUNT(*) as total
    FROM visits v
    WHERE v.store_id = ? AND v.therapist_signed_at IS NOT NULL ${dateFilter}
  `).bind(session.storeId).first<{ foot: number; body: number; combo: number; total: number }>()

  return c.json({
    breakdown: {
      foot: rows?.foot ?? 0,
      body: rows?.body ?? 0,
      combo: rows?.combo ?? 0,
      total: rows?.total ?? 0,
    },
  })
})

// --- GET /manage/analytics/rates ---
manage.get('/analytics/rates', async (c) => {
  const session = c.get('session')

  const stats = await c.env.DB.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN therapist_signed_at IS NOT NULL THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN cancelled_at IS NOT NULL THEN 1 ELSE 0 END) as cancelled,
      SUM(CASE WHEN points_redeemed > 0 THEN 1 ELSE 0 END) as redeemed
    FROM visits
    WHERE store_id = ? AND visit_date >= strftime('%Y-01-01', 'now')
  `).bind(session.storeId).first<{
    total: number; completed: number; cancelled: number; redeemed: number
  }>()

  const total = stats?.total ?? 0
  const completed = stats?.completed ?? 0
  const cancelled = stats?.cancelled ?? 0
  const redeemed = stats?.redeemed ?? 0

  // Monthly redemption breakdown for this year
  const redemptionRows = await c.env.DB.prepare(`
    SELECT strftime('%Y-%m', visit_date) as month,
           SUM(CASE WHEN points_redeemed > 0 THEN 1 ELSE 0 END) as count
    FROM visits
    WHERE store_id = ? AND visit_date >= strftime('%Y-01-01', 'now')
    GROUP BY month ORDER BY month ASC
  `).bind(session.storeId).all<{ month: string; count: number }>()

  // Fill all months of the year
  const now = new Date()
  const year = now.getFullYear()
  const pad = (n: number) => String(n).padStart(2, '0')
  const redemptionMap = new Map((redemptionRows.results || []).map((r) => [r.month, r.count]))
  const redemptionByMonth = Array.from({ length: 12 }, (_, i) => {
    const m = `${year}-${pad(i + 1)}`
    const count = redemptionMap.get(m) ?? 0
    return { month: m, count, amount: count * 50 }
  })

  return c.json({
    rates: {
      total,
      completed,
      cancelled,
      redeemed,
      redeemedAmount: redeemed * 50,
      cancellationRate: total > 0 ? Math.round((cancelled / total) * 1000) / 10 : 0,
      redemptionByMonth,
    },
  })
})

// --- GET /manage/analytics/therapist-ranking?period=month|year ---
// Fuzzy-clusters therapist names to handle typos, case, and cross-language input
manage.get('/analytics/therapist-ranking', async (c) => {
  const session = c.get('session')
  const period = c.req.query('period') || 'month'

  const dateFilter = period === 'year'
    ? "AND visit_date >= strftime('%Y-01-01', 'now')"
    : "AND visit_date >= strftime('%Y-%m-01', 'now')"

  const rows = await c.env.DB.prepare(`
    SELECT therapist_name, COUNT(*) as cnt,
      SUM(CASE WHEN UPPER(SUBSTR(TRIM(therapist_service_technique), 1, 1)) = 'F' THEN 1 ELSE 0 END) as foot,
      SUM(CASE WHEN UPPER(SUBSTR(TRIM(therapist_service_technique), 1, 1)) = 'B' THEN 1 ELSE 0 END) as body,
      SUM(CASE WHEN UPPER(SUBSTR(TRIM(therapist_service_technique), 1, 1)) = 'C' THEN 1 ELSE 0 END) as combo
    FROM visits
    WHERE store_id = ? AND therapist_signed_at IS NOT NULL
      ${dateFilter}
    GROUP BY therapist_name
    ORDER BY cnt DESC
  `).bind(session.storeId).all<{ therapist_name: string; cnt: number; foot: number; body: number; combo: number }>()

  // Cluster by fuzzy name matching
  const entries = (rows.results || []).filter((r) => r.therapist_name)

  // Normalize: trim + collapse case for latin, keep CJK as-is
  function normalize(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, ' ')
  }

  // Levenshtein distance
  function editDistance(a: string, b: string): number {
    const m = a.length, n = b.length
    if (m === 0) return n
    if (n === 0) return m
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
    for (let i = 0; i <= m; i++) dp[i][0] = i
    for (let j = 0; j <= n; j++) dp[0][j] = j
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
        )
      }
    }
    return dp[m][n]
  }

  // Threshold: short names (<=4) allow 1 edit, longer names allow ~30%, max 3
  function threshold(name: string): number {
    if (name.length <= 4) return 1
    return Math.min(3, Math.ceil(name.length * 0.3))
  }

  // Check if two names are similar enough to merge
  function isSimilar(a: string, b: string): boolean {
    const dist = editDistance(a, b)
    const shorter = Math.min(a.length, b.length)
    const shorterStr = a.length <= b.length ? a : b
    if (dist <= threshold(shorterStr)) return true
    // Extra: if same length and same sorted chars → likely typo/swap (wei/wie)
    if (a.length === b.length && a.length <= 5) {
      const sortA = a.split('').sort().join('')
      const sortB = b.split('').sort().join('')
      if (sortA === sortB) return true
    }
    return false
  }

  // Cluster: merge entries whose normalized names are similar
  interface Cluster { canonical: string; count: number; foot: number; body: number; combo: number; variants: string[] }
  const clusters: Cluster[] = []

  for (const entry of entries) {
    const norm = normalize(entry.therapist_name)
    let merged = false
    for (const cluster of clusters) {
      const clusterNorm = normalize(cluster.canonical)
      if (isSimilar(norm, clusterNorm)) {
        cluster.count += entry.cnt
        cluster.foot += entry.foot ?? 0
        cluster.body += entry.body ?? 0
        cluster.combo += entry.combo ?? 0
        if (!cluster.variants.includes(entry.therapist_name)) {
          cluster.variants.push(entry.therapist_name)
        }
        merged = true
        break
      }
    }
    if (!merged) {
      clusters.push({
        canonical: entry.therapist_name,
        count: entry.cnt,
        foot: entry.foot ?? 0,
        body: entry.body ?? 0,
        combo: entry.combo ?? 0,
        variants: [entry.therapist_name],
      })
    }
  }

  clusters.sort((a, b) => b.count - a.count)

  return c.json({
    ranking: clusters.map((c) => ({
      name: c.canonical,
      count: c.count,
      foot: c.foot,
      body: c.body,
      combo: c.combo,
      variants: c.variants,
    })),
  })
})

// --- GET /manage/analytics/top-customers ---
// Top 5 most frequent customers this year (store-level) with service breakdown
manage.get('/analytics/top-customers', async (c) => {
  const session = c.get('session')
  const year = String(new Date().getFullYear())

  const rows = await c.env.DB.prepare(`
    SELECT c.id, c.first_name, c.last_name, c.phone,
           COUNT(*) as visit_count,
           SUM(CASE WHEN UPPER(SUBSTR(TRIM(v.therapist_service_technique), 1, 1)) = 'F' THEN 1 ELSE 0 END) as foot,
           SUM(CASE WHEN UPPER(SUBSTR(TRIM(v.therapist_service_technique), 1, 1)) = 'B' THEN 1 ELSE 0 END) as body,
           SUM(CASE WHEN UPPER(SUBSTR(TRIM(v.therapist_service_technique), 1, 1)) = 'C' THEN 1 ELSE 0 END) as combo
    FROM visits v JOIN customers c ON v.customer_id = c.id
    WHERE v.store_id = ? AND v.therapist_signed_at IS NOT NULL AND strftime('%Y', v.visit_date) = ?
    GROUP BY c.id ORDER BY visit_count DESC LIMIT 5
  `).bind(session.storeId, year).all<{
    id: string; first_name: string; last_name: string; phone: string;
    visit_count: number; foot: number; body: number; combo: number
  }>()

  return c.json({
    customers: (rows.results || []).map((r) => ({
      id: r.id, name: `${r.first_name} ${r.last_name}`, phone: r.phone,
      visitCount: r.visit_count, foot: r.foot, body: r.body, combo: r.combo,
    })),
  })
})

export default manage
