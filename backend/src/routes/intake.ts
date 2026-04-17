import { Hono } from 'hono'
import { intakeFormDataSchema } from '@spa-crm/shared'

type Bindings = { DB: D1Database; JWT_SECRET: string }
type Session = { storeId: string; role: string; sessionId: string; sessionStartAt: string }

const intake = new Hono<{ Bindings: Bindings; Variables: { session: Session } }>()

// --- GET /customers/:id/intake ---
intake.get('/customers/:id/intake', async (c) => {
  const customerId = c.req.param('id')

  const form = await c.env.DB.prepare(
    'SELECT * FROM intake_forms WHERE customer_id = ?',
  ).bind(customerId).first<Record<string, unknown>>()

  if (!form) return c.json({ error: 'Intake form not found' }, 404)

  let formData = {}
  try { formData = JSON.parse(form.form_data as string) } catch { /* empty */ }

  return c.json({
    intakeForm: {
      id: form.id,
      customerId: form.customer_id,
      formVersion: form.form_version,
      formData,
      status: form.status,
      clientSignedAt: form.client_signed_at,
      lastReviewedAt: form.last_reviewed_at,
      completedAt: form.completed_at,
      createdAt: form.created_at,
      updatedAt: form.updated_at,
    },
  })
})

// --- PUT /customers/:id/intake (re-sign with changes) ---
intake.put('/customers/:id/intake', async (c) => {
  const customerId = c.req.param('id')

  const body = await c.req.json<{ formData: unknown }>()

  const parsed = intakeFormDataSchema.safeParse(body.formData)
  if (!parsed.success) return c.json({ error: 'Invalid form data', details: parsed.error.flatten() }, 400)

  const form = await c.env.DB.prepare('SELECT id FROM intake_forms WHERE customer_id = ?').bind(customerId).first()
  if (!form) return c.json({ error: 'Intake form not found' }, 404)

  await c.env.DB.prepare(
    `UPDATE intake_forms SET form_data = ?, status = 'client_signed', client_signed_at = datetime('now') WHERE customer_id = ?`,
  ).bind(JSON.stringify(parsed.data), customerId).run()

  return c.json({ updated: true })
})

// --- PATCH /customers/:id/intake/review (no changes, just stamp) ---
intake.patch('/customers/:id/intake/review', async (c) => {
  const customerId = c.req.param('id')

  const form = await c.env.DB.prepare('SELECT id FROM intake_forms WHERE customer_id = ?').bind(customerId).first()
  if (!form) return c.json({ error: 'Intake form not found' }, 404)

  await c.env.DB.prepare(
    "UPDATE intake_forms SET last_reviewed_at = datetime('now') WHERE customer_id = ?",
  ).bind(customerId).run()

  return c.json({ reviewed: true })
})

export default intake
