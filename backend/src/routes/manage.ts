import { Hono } from 'hono'
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

  let whereClause = 'WHERE v.store_id = ?'
  const params: unknown[] = [session.storeId]

  if (search) {
    whereClause += " AND (c.first_name LIKE ? OR c.last_name LIKE ? OR c.phone LIKE ?)"
    const s = `%${search}%`
    params.push(s, s, s)
  }

  const countResult = await c.env.DB.prepare(
    `SELECT COUNT(DISTINCT c.id) as total FROM customers c JOIN visits v ON v.customer_id = c.id ${whereClause}`,
  ).bind(...params).first<{ total: number }>()

  const rows = await c.env.DB.prepare(`
    SELECT c.id, c.first_name, c.last_name, c.phone, c.email,
           MAX(v.visit_date) as last_visit, COUNT(v.id) as total_visits
    FROM customers c
    JOIN visits v ON v.customer_id = c.id
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

  let whereClause = 'WHERE v.store_id = ?'
  const params: unknown[] = [session.storeId]

  if (dateFrom) { whereClause += ' AND v.visit_date >= ?'; params.push(dateFrom) }
  if (dateTo) { whereClause += ' AND v.visit_date <= ?'; params.push(dateTo) }
  if (therapistName) { whereClause += ' AND v.therapist_name LIKE ?'; params.push(`%${therapistName}%`) }

  const countResult = await c.env.DB.prepare(
    `SELECT COUNT(*) as total FROM visits v ${whereClause}`,
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
      therapistSignedAt: v.therapist_signed_at, cancelledAt: v.cancelled_at,
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

export default manage
