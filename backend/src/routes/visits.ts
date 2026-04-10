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
    therapistName: z.string(),
  }).safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: 'Invalid input' }, 400)
  const body = parsed.data

  const customer = await c.env.DB.prepare('SELECT id FROM customers WHERE id = ?').bind(customerId).first()
  if (!customer) return c.json({ error: 'Customer not found' }, 404)

  const existingPending = await c.env.DB.prepare(
    'SELECT id FROM visits WHERE customer_id = ? AND store_id = ? AND therapist_signed_at IS NULL AND cancelled_at IS NULL LIMIT 1',
  ).bind(customerId, session.storeId).first()
  if (existingPending) return c.json({ error: 'Customer already has a pending visit' }, 409)

  const visitId = generateId()
  await c.env.DB.prepare(
    'INSERT INTO visits (id, customer_id, store_id, service_type, therapist_name) VALUES (?, ?, ?, ?, ?)',
  ).bind(visitId, customerId, session.storeId, body.serviceType, body.therapistName).run()

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
    therapistSignedAt: v.therapist_signed_at,
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
    SELECT v.*, c.first_name, c.last_name
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

  // db.batch: sign visit + update intake_forms.status (14.3)
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE visits SET therapist_name = ?, therapist_service_technique = ?, therapist_body_parts_notes = ?,
       therapist_signed_at = datetime('now') WHERE id = ?`,
    ).bind(body.therapistName, body.therapistServiceTechnique, body.therapistBodyPartsNotes, id),
    c.env.DB.prepare(
      `UPDATE intake_forms SET status = 'completed', completed_at = datetime('now')
       WHERE customer_id = ? AND status = 'client_signed'`,
    ).bind(visit.customer_id),
  ])

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
