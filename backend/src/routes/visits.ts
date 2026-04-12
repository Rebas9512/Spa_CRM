import { Hono } from 'hono'
import { z } from 'zod'
import { generateId } from '../lib/id'

type Bindings = { DB: D1Database; JWT_SECRET: string }
type Session = { storeId: string; role: string; sessionId: string; sessionStartAt: string }

const visits = new Hono<{ Bindings: Bindings; Variables: { session: Session } }>()

// --- POST /customers/:id/visits (returning customer check-in) ---
visits.post('/customers/:id/visits', async (c) => {
  const session = c.get('session')
  const customerId = c.req.param('id')
  const parsed = z.object({
    serviceType: z.string().min(1),
  }).safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: 'Invalid input' }, 400)
  const body = parsed.data

  const customer = await c.env.DB.prepare('SELECT id FROM customers WHERE id = ?').bind(customerId).first()
  if (!customer) return c.json({ error: 'Customer not found' }, 404)

  const visitId = generateId()
  await c.env.DB.prepare(
    'INSERT INTO visits (id, customer_id, store_id, service_type) VALUES (?, ?, ?, ?)',
  ).bind(visitId, customerId, session.storeId, body.serviceType).run()

  const visit = await c.env.DB.prepare('SELECT visit_date FROM visits WHERE id = ?').bind(visitId).first<{ visit_date: string }>()

  return c.json({ visitId, visitDate: visit?.visit_date }, 201)
})

// --- GET /customers/:id/visits (visit history — scoped to current store) ---
visits.get('/customers/:id/visits', async (c) => {
  const session = c.get('session')
  const customerId = c.req.param('id')

  const rows = await c.env.DB.prepare(`
    SELECT v.*, s.name as store_name
    FROM visits v
    JOIN stores s ON v.store_id = s.id
    WHERE v.customer_id = ? AND v.store_id = ?
    ORDER BY v.visit_date DESC
  `).bind(customerId, session.storeId).all<Record<string, unknown>>()

  const visitList = (rows.results || []).map((v) => ({
    id: v.id,
    visitDate: v.visit_date,
    serviceType: v.service_type,
    therapistName: v.therapist_name,
    storeName: v.store_name,
    therapistServiceTechnique: v.therapist_service_technique ?? null,
    therapistSignedAt: v.therapist_signed_at,
    pointsRedeemed: v.points_redeemed ?? 0, pointsAfter: v.points_after ?? null,
    cancelledAt: v.cancelled_at,
    createdAt: v.created_at,
  }))

  return c.json({ visits: visitList })
})

// --- GET /visits/:id ---
visits.get('/visits/:id', async (c) => {
  const id = c.req.param('id')
  const session = c.get('session')

  const visit = await c.env.DB.prepare(`
    SELECT v.*, c.first_name, c.last_name, c.loyalty_points
    FROM visits v JOIN customers c ON v.customer_id = c.id
    WHERE v.id = ?
  `).bind(id).first<Record<string, unknown>>()
  if (!visit) return c.json({ error: 'Visit not found' }, 404)

  // Store authorization — employees can only access their store's visits
  if (visit.store_id !== session.storeId) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  // Get health alerts from intake form
  const intake = await c.env.DB.prepare(
    'SELECT form_data FROM intake_forms WHERE customer_id = ?',
  ).bind(visit.customer_id).first<{ form_data: string }>()

  let healthAlerts: Record<string, unknown> = {}
  let areasToAvoid = ''
  if (intake) {
    try {
      const fd = JSON.parse(intake.form_data)
      healthAlerts = {
        hasHighBloodPressure: fd.hasHighBloodPressure || false,
        hasHeartConditions: fd.hasHeartConditions || false,
        hasInjuries: fd.hasInjuries || false,
        hasVaricoseVeins: fd.hasVaricoseVeins || false,
        isPregnant: fd.isPregnant || false,
        hasSpinalProblems: fd.hasSpinalProblems || false,
        hasAllergies: fd.hasAllergies || false,
        hasBruiseEasily: fd.hasBruiseEasily || false,
        hasMigraines: fd.hasMigraines || false,
      }
      areasToAvoid = fd.areasToAvoid || ''
    } catch { /* empty */ }
  }

  // Find next pending visit for queue navigation
  const nextPending = await c.env.DB.prepare(
    `SELECT id FROM visits WHERE store_id = ? AND therapist_signed_at IS NULL AND cancelled_at IS NULL AND id != ? ORDER BY visit_date ASC LIMIT 1`,
  ).bind(session.storeId, id).first<{ id: string }>()

  return c.json({
    visit: {
      id: visit.id,
      customerId: visit.customer_id,
      customerName: `${visit.first_name} ${visit.last_name}`,
      storeId: visit.store_id,
      visitDate: visit.visit_date,
      serviceType: visit.service_type,
      therapistName: visit.therapist_name,
      notes: visit.notes,
      therapistServiceTechnique: visit.therapist_service_technique,
      therapistBodyPartsNotes: visit.therapist_body_parts_notes,
      therapistSignatureDataUrl: visit.therapist_signature_data_url,
      therapistSignedAt: visit.therapist_signed_at,
      cancelledAt: visit.cancelled_at,
      createdAt: visit.created_at,
      customerLoyaltyPoints: visit.loyalty_points ?? 0,
      healthAlerts,
      areasToAvoid,
      nextPendingVisitId: nextPending?.id || null,
    },
  })
})

// --- PATCH /visits/:id/therapist (Sign & Next) ---
visits.patch('/visits/:id/therapist', async (c) => {
  const id = c.req.param('id')
  const session = c.get('session')
  const parsed = z.object({
    therapistName: z.string().min(1),
    therapistServiceTechnique: z.string().min(1),
    therapistBodyPartsNotes: z.string().min(1),
    redeemPoints: z.boolean().optional().default(false),
  }).safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: 'Invalid input' }, 400)
  const body = parsed.data

  const visit = await c.env.DB.prepare('SELECT * FROM visits WHERE id = ?').bind(id).first<Record<string, unknown>>()
  if (!visit) return c.json({ error: 'Visit not found' }, 404)

  // Store authorization
  if (visit.store_id !== session.storeId) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  if (visit.therapist_signed_at) return c.json({ error: 'Visit already signed' }, 409)

  // Loyalty points: pre-check for early 400 (non-atomic, but atomic guard is in SQL below)
  if (body.redeemPoints) {
    const customer = await c.env.DB.prepare(
      'SELECT loyalty_points FROM customers WHERE id = ?',
    ).bind(visit.customer_id).first<{ loyalty_points: number }>()
    if (!customer || customer.loyalty_points < 10) {
      return c.json({ error: 'Insufficient loyalty points for redemption' }, 400)
    }
  }

  const pointsRedeemed = body.redeemPoints ? 10 : 0
  // Chair items (A1, A2, A3) and F1 do not earn loyalty points
  const noPointsItem = ['A1', 'A2', 'A3', 'F1'].includes(body.therapistServiceTechnique)

  // db.batch: sign visit + update intake + loyalty points (atomic guard via CASE)
  const batchOps = [
    c.env.DB.prepare(
      `UPDATE visits SET therapist_name = ?, therapist_service_technique = ?, therapist_body_parts_notes = ?,
       therapist_signed_at = datetime('now'), points_redeemed = ? WHERE id = ?`,
    ).bind(body.therapistName, body.therapistServiceTechnique, body.therapistBodyPartsNotes, pointsRedeemed, id),
    c.env.DB.prepare(
      `UPDATE intake_forms SET status = 'completed', completed_at = datetime('now')
       WHERE customer_id = ? AND status = 'client_signed'`,
    ).bind(visit.customer_id),
    // Atomic: redeem → -10; chair → no change; normal → +1
    c.env.DB.prepare(
      `UPDATE customers SET loyalty_points = CASE
         WHEN ? > 0 AND loyalty_points >= ? THEN loyalty_points - ?
         WHEN ? THEN loyalty_points
         ELSE loyalty_points + 1
       END WHERE id = ?`,
    ).bind(pointsRedeemed, pointsRedeemed, pointsRedeemed, noPointsItem ? 1 : 0, visit.customer_id),
  ]
  await c.env.DB.batch(batchOps)

  // Read actual balance after batch to record accurate points_after
  const updated = await c.env.DB.prepare(
    'SELECT loyalty_points FROM customers WHERE id = ?',
  ).bind(visit.customer_id).first<{ loyalty_points: number }>()
  const pointsAfter = updated?.loyalty_points ?? 0

  await c.env.DB.prepare(
    'UPDATE visits SET points_after = ? WHERE id = ?',
  ).bind(pointsAfter, id).run()

  // Find next pending visit for "Sign & Next"
  const nextPending = await c.env.DB.prepare(
    `SELECT id FROM visits WHERE store_id = ? AND therapist_signed_at IS NULL AND cancelled_at IS NULL AND id != ? ORDER BY visit_date ASC LIMIT 1`,
  ).bind(session.storeId, id).first<{ id: string }>()

  return c.json({
    therapistSignedAt: new Date().toISOString(),
    nextPendingVisitId: nextPending?.id || null,
  })
})

// --- PATCH /visits/:id/cancel ---
visits.patch('/visits/:id/cancel', async (c) => {
  const id = c.req.param('id')
  const session = c.get('session')
  const visit = await c.env.DB.prepare('SELECT * FROM visits WHERE id = ?').bind(id).first<Record<string, unknown>>()
  if (!visit) return c.json({ error: 'Visit not found' }, 404)

  // Store authorization
  if (visit.store_id !== session.storeId) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  if (visit.therapist_signed_at) return c.json({ error: 'Visit already signed by therapist' }, 409)
  if (visit.cancelled_at) return c.json({ error: 'Visit already cancelled' }, 409)

  await c.env.DB.prepare(
    "UPDATE visits SET cancelled_at = datetime('now') WHERE id = ?",
  ).bind(id).run()

  return c.json({ cancelledAt: new Date().toISOString() })
})

export default visits
