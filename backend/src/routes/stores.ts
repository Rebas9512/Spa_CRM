import { Hono } from 'hono'

type Bindings = { DB: D1Database; JWT_SECRET: string }
type Session = { storeId: string; role: string; sessionId: string; sessionStartAt: string }

const stores = new Hono<{ Bindings: Bindings; Variables: { session: Session } }>()

// --- GET /stores/:id/visits/pending-therapist ---
stores.get('/:id/visits/pending-therapist', async (c) => {
  const session = c.get('session')
  const storeId = c.req.param('id')

  // Verify the requesting session belongs to this store
  if (session.storeId !== storeId) {
    return c.json({ error: 'Unauthorized' }, 403)
  }

  const rows = await c.env.DB.prepare(`
    SELECT v.id, v.customer_id, v.visit_date, v.service_type, v.therapist_name,
           c.first_name, c.last_name
    FROM visits v
    JOIN customers c ON v.customer_id = c.id
    WHERE v.store_id = ? AND v.therapist_signed_at IS NULL AND v.cancelled_at IS NULL
    ORDER BY v.visit_date ASC
  `).bind(storeId).all<Record<string, unknown>>()

  const visitList = (rows.results || []).map((v) => ({
    id: v.id,
    customerId: v.customer_id,
    customerName: `${v.first_name} ${v.last_name}`,
    visitDate: v.visit_date,
    serviceType: v.service_type,
    therapistName: v.therapist_name,
  }))

  return c.json({ visits: visitList })
})

export default stores
