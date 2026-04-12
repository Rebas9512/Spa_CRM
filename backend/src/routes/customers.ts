import { Hono } from 'hono'
import { z } from 'zod'
import { generateId } from '../lib/id'
import { phoneSchema, createCustomerSchema } from '@spa-crm/shared'

type Bindings = { DB: D1Database; JWT_SECRET: string }
type Session = { storeId: string; role: string; sessionId: string; sessionStartAt: string }

const customers = new Hono<{ Bindings: Bindings; Variables: { session: Session } }>()

// --- GET /customers/search?phone= ---
customers.get('/search', async (c) => {
  const session = c.get('session')
  const rawPhone = c.req.query('phone') || ''
  const parsed = phoneSchema.safeParse(rawPhone)
  if (!parsed.success) return c.json({ error: 'Invalid phone number' }, 400)
  const phone = parsed.data

  const customer = await c.env.DB.prepare(
    'SELECT * FROM customers WHERE phone = ?',
  ).bind(phone).first<Record<string, unknown>>()
  if (!customer) return c.json({ error: 'Customer not found' }, 404)

  // Aggregate visit stats — scoped to current store
  const stats = await c.env.DB.prepare(`
    SELECT COUNT(*) as totalVisits,
           MAX(visit_date) as lastVisit,
           (SELECT therapist_name FROM visits WHERE customer_id = ? AND store_id = ? ORDER BY visit_date DESC LIMIT 1) as lastTherapist,
           (SELECT s.name FROM visits v JOIN stores s ON v.store_id = s.id WHERE v.customer_id = ? AND v.store_id = ? ORDER BY v.visit_date DESC LIMIT 1) as lastStore
    FROM visits WHERE customer_id = ? AND store_id = ?
  `).bind(customer.id, session.storeId, customer.id, session.storeId, customer.id, session.storeId).first<Record<string, unknown>>()

  // Get intake form for health alerts
  const intake = await c.env.DB.prepare(
    'SELECT status, form_data FROM intake_forms WHERE customer_id = ?',
  ).bind(customer.id).first<{ status: string; form_data: string }>()

  let healthAlerts: Record<string, unknown> = {}
  let preferredMassageType = ''
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
        areasToAvoid: fd.areasToAvoid || '',
      }
      preferredMassageType = fd.preferredMassageType || ''
    } catch { /* empty */ }
  }

  return c.json({
    customer: {
      id: customer.id,
      firstName: customer.first_name,
      lastName: customer.last_name,
      phone: customer.phone,
      totalVisits: stats?.totalVisits || 0,
      intakeStatus: intake?.status || null,
      lastVisit: stats?.lastVisit || null,
      lastTherapist: stats?.lastTherapist || null,
      lastStore: stats?.lastStore || null,
      staffNotes: customer.staff_notes || '',
      preferredMassageType,
      healthAlerts,
    },
  })
})

// --- GET /customers/lookup?q= (global fuzzy search by name or phone) ---
customers.get('/lookup', async (c) => {
  const q = (c.req.query('q') || '').trim()
  if (!q) return c.json({ customers: [] })

  const like = `%${q}%`
  const rows = await c.env.DB.prepare(`
    SELECT c.*, if2.form_data
    FROM customers c
    LEFT JOIN intake_forms if2 ON if2.customer_id = c.id
    WHERE c.first_name LIKE ? OR c.last_name LIKE ? OR c.phone LIKE ?
    ORDER BY c.updated_at DESC
    LIMIT 20
  `).bind(like, like, like).all<Record<string, unknown>>()

  const customers = (rows.results || []).map((r) => {
    let healthStatus = 'ok'
    try {
      const fd = JSON.parse((r.form_data as string) || '{}')
      if (fd.hasHighBloodPressure || fd.hasHeartConditions || fd.isPregnant || fd.hasInjuries || fd.hasVaricoseVeins) {
        healthStatus = 'alert'
      }
    } catch { /* empty */ }
    return {
      id: r.id, firstName: r.first_name, lastName: r.last_name, phone: r.phone,
      lastVisitDate: null, lastService: null, lastTherapist: null,
      totalVisits: 0, intakeStatus: null, healthStatus,
    }
  })

  return c.json({ customers })
})

// --- GET /customers/recent?limit= ---
customers.get('/recent', async (c) => {
  const session = c.get('session')
  const limit = parseInt(c.req.query('limit') || '20', 10) || 20

  const rows = await c.env.DB.prepare(`
    SELECT c.*, v.visit_date as last_visit_date, v.service_type as last_service, v.therapist_name as last_therapist,
           (SELECT COUNT(*) FROM visits WHERE customer_id = c.id AND store_id = ?) as total_visits,
           if2.status as intake_status, if2.form_data
    FROM customers c
    JOIN visits v ON v.customer_id = c.id AND v.store_id = ?
    LEFT JOIN intake_forms if2 ON if2.customer_id = c.id
    WHERE v.visit_date = (SELECT MAX(v2.visit_date) FROM visits v2 WHERE v2.customer_id = c.id AND v2.store_id = ?)
    ORDER BY v.visit_date DESC
    LIMIT ?
  `).bind(session.storeId, session.storeId, session.storeId, limit).all<Record<string, unknown>>()

  const customers = (rows.results || []).map((r) => {
    let healthStatus = 'ok'
    try {
      const fd = JSON.parse((r.form_data as string) || '{}')
      if (fd.hasHighBloodPressure || fd.hasHeartConditions || fd.isPregnant || fd.hasInjuries || fd.hasVaricoseVeins) {
        healthStatus = 'alert'
      }
    } catch { /* empty */ }
    return {
      id: r.id,
      firstName: r.first_name,
      lastName: r.last_name,
      phone: r.phone,
      lastVisitDate: r.last_visit_date,
      lastService: r.last_service,
      lastTherapist: r.last_therapist,
      totalVisits: r.total_visits,
      intakeStatus: r.intake_status,
      healthStatus,
    }
  })

  return c.json({ customers })
})

// --- POST /customers (create customer + intake_form + visit atomically) ---
customers.post('/', async (c) => {
  const session = c.get('session')
  const parsed = createCustomerSchema.safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400)
  const data = parsed.data

  // Check existing by phone
  const existing = await c.env.DB.prepare('SELECT id FROM customers WHERE phone = ?').bind(data.phone).first<{ id: string }>()

  if (existing) {
    // Existing customer through new-client form: update info + intake + create visit
    const customerId = existing.id
    const visitId = generateId()

    try {
      const intakeFormId = generateId()
      await c.env.DB.batch([
        c.env.DB.prepare(
          `UPDATE customers SET first_name = ?, last_name = ?, email = ?, address = ?, date_of_birth = ?, gender = ?,
           emergency_contact_name = ?, emergency_contact_phone = ? WHERE id = ?`,
        ).bind(
          data.firstName, data.lastName,
          data.email || null, data.address || null, data.dateOfBirth || null, data.gender || null,
          data.emergencyContactName || null, data.emergencyContactPhone || null, customerId,
        ),
        c.env.DB.prepare(
          `INSERT INTO intake_forms (id, customer_id, form_data, status, client_signed_at)
           VALUES (?, ?, ?, 'client_signed', datetime('now'))
           ON CONFLICT(customer_id) DO UPDATE SET form_data = excluded.form_data, status = excluded.status, client_signed_at = excluded.client_signed_at`,
        ).bind(intakeFormId, customerId, JSON.stringify(data.intakeFormData)),
        c.env.DB.prepare(
          `INSERT INTO visits (id, customer_id, store_id, service_type, therapist_name)
           VALUES (?, ?, ?, ?, ?)`,
        ).bind(visitId, customerId, session.storeId, data.firstVisit.serviceType, data.firstVisit.therapistName),
      ])
    } catch {
      return c.json({ error: 'Failed to create customer' }, 500)
    }

    return c.json({ customerId, visitId, updated: true }, 200)
  }

  const customerId = generateId()
  const intakeFormId = generateId()
  const visitId = generateId()

  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO customers (id, phone, first_name, last_name, email, address, date_of_birth, gender, emergency_contact_name, emergency_contact_phone)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        customerId, data.phone, data.firstName, data.lastName,
        data.email || null, data.address || null, data.dateOfBirth || null, data.gender || null,
        data.emergencyContactName || null, data.emergencyContactPhone || null,
      ),
      c.env.DB.prepare(
        `INSERT INTO intake_forms (id, customer_id, form_data, status, client_signed_at)
         VALUES (?, ?, ?, 'client_signed', datetime('now'))`,
      ).bind(intakeFormId, customerId, JSON.stringify(data.intakeFormData)),
      c.env.DB.prepare(
        `INSERT INTO visits (id, customer_id, store_id, service_type, therapist_name)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(visitId, customerId, session.storeId, data.firstVisit.serviceType, data.firstVisit.therapistName),
    ])
  } catch {
    return c.json({ error: 'Failed to create customer' }, 500)
  }

  return c.json({ customerId, intakeFormId, visitId }, 201)
})

// --- GET /customers/:id ---
customers.get('/:id', async (c) => {
  const id = c.req.param('id')
  const session = c.get('session')
  const customer = await c.env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(id).first<Record<string, unknown>>()
  if (!customer) return c.json({ error: 'Customer not found' }, 404)

  // Aggregate visit stats — scoped to current store
  const stats = await c.env.DB.prepare(`
    SELECT COUNT(*) as totalVisits, MAX(visit_date) as lastVisit
    FROM visits WHERE customer_id = ? AND store_id = ?
  `).bind(id, session.storeId).first<Record<string, unknown>>()

  // Get intake form for health alerts
  const intake = await c.env.DB.prepare(
    'SELECT id, status, form_data FROM intake_forms WHERE customer_id = ?',
  ).bind(id).first<{ id: string; status: string; form_data: string }>()

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

  // Get visit history — scoped to current store
  const visitRows = await c.env.DB.prepare(`
    SELECT v.*, s.name as store_name
    FROM visits v JOIN stores s ON v.store_id = s.id
    WHERE v.customer_id = ? AND v.store_id = ? ORDER BY v.visit_date DESC
  `).bind(id, session.storeId).all<Record<string, unknown>>()

  const visits = (visitRows.results || []).map((v) => ({
    id: v.id,
    visitDate: v.visit_date,
    serviceType: v.service_type,
    therapistName: v.therapist_name,
    storeName: v.store_name,
    therapistServiceTechnique: v.therapist_service_technique ?? null,
    therapistSignedAt: v.therapist_signed_at,
    pointsRedeemed: v.points_redeemed ?? 0, pointsAfter: v.points_after ?? null,
    cancelledAt: v.cancelled_at,
  }))

  return c.json({
    customer: {
      id: customer.id,
      firstName: customer.first_name,
      lastName: customer.last_name,
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
      dateOfBirth: customer.date_of_birth,
      gender: customer.gender,
      emergencyContactName: customer.emergency_contact_name,
      emergencyContactPhone: customer.emergency_contact_phone,
      staffNotes: customer.staff_notes || '',
      loyaltyPoints: customer.loyalty_points ?? 0,
      loyaltyImportedAt: customer.loyalty_imported_at ?? null,
      createdAt: customer.created_at,
      updatedAt: customer.updated_at,
      totalVisits: stats?.totalVisits || 0,
      lastVisit: stats?.lastVisit || null,
      intakeFormId: intake?.id || null,
      healthAlerts,
      areasToAvoid,
      visits,
    },
  })
})

// --- PUT /customers/:id ---
customers.put('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<Record<string, string>>()

  const customer = await c.env.DB.prepare('SELECT id FROM customers WHERE id = ?').bind(id).first()
  if (!customer) return c.json({ error: 'Customer not found' }, 404)

  const fields: string[] = []
  const values: unknown[] = []
  const mapping: Record<string, string> = {
    firstName: 'first_name', lastName: 'last_name', phone: 'phone',
    email: 'email', address: 'address', dateOfBirth: 'date_of_birth',
    gender: 'gender', emergencyContactName: 'emergency_contact_name',
    emergencyContactPhone: 'emergency_contact_phone',
  }

  for (const [key, col] of Object.entries(mapping)) {
    if (body[key] !== undefined) {
      // Normalize phone if provided
      if (key === 'phone') {
        const parsed = phoneSchema.safeParse(body[key])
        if (!parsed.success) return c.json({ error: 'Invalid phone' }, 400)
        fields.push(`${col} = ?`)
        values.push(parsed.data)
      } else {
        fields.push(`${col} = ?`)
        values.push(body[key])
      }
    }
  }

  if (fields.length === 0) return c.json({ error: 'No fields to update' }, 400)
  values.push(id)

  await c.env.DB.prepare(`UPDATE customers SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run()
  return c.json({ updated: true })
})

// --- PATCH /customers/:id/notes ---
customers.patch('/:id/notes', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<{ staffNotes: string }>()

  const customer = await c.env.DB.prepare('SELECT id FROM customers WHERE id = ?').bind(id).first()
  if (!customer) return c.json({ error: 'Customer not found' }, 404)

  await c.env.DB.prepare('UPDATE customers SET staff_notes = ? WHERE id = ?').bind(body.staffNotes, id).run()
  return c.json({ updated: true })
})

// --- POST /customers/:id/import-points (one-time staff import) ---
customers.post('/:id/import-points', async (c) => {
  const id = c.req.param('id')
  const parsed = z.object({
    points: z.number().int().min(1),
  }).safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: 'Invalid input: points must be a positive integer' }, 400)

  const customer = await c.env.DB.prepare(
    'SELECT id, loyalty_imported_at FROM customers WHERE id = ?',
  ).bind(id).first<{ id: string; loyalty_imported_at: string | null }>()
  if (!customer) return c.json({ error: 'Customer not found' }, 404)

  // Early check (non-atomic, atomic guard is in SQL below)
  if (customer.loyalty_imported_at) {
    return c.json({ error: 'Points already imported for this customer' }, 400)
  }

  // Atomic: only import if loyalty_imported_at IS NULL (prevents concurrent double-import)
  await c.env.DB.prepare(
    `UPDATE customers SET loyalty_points = loyalty_points + ?,
     loyalty_imported_at = datetime('now')
     WHERE id = ? AND loyalty_imported_at IS NULL`,
  ).bind(parsed.data.points, id).run()

  const updated = await c.env.DB.prepare(
    'SELECT loyalty_points, loyalty_imported_at FROM customers WHERE id = ?',
  ).bind(id).first<{ loyalty_points: number; loyalty_imported_at: string | null }>()

  if (!updated?.loyalty_imported_at) {
    return c.json({ error: 'Points already imported for this customer' }, 400)
  }

  return c.json({
    loyaltyPoints: updated.loyalty_points,
    loyaltyImportedAt: updated.loyalty_imported_at,
  })
})

export default customers
