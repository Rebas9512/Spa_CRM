import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  MASSAGE_TYPES,
  HEALTH_CONDITIONS,
  GENDER_OPTIONS,
} from '@spa-crm/shared'
import type { IntakeFormData } from '@spa-crm/shared'
import { apiFetch } from '../../lib/apiClient'
import SignaturePad from '../../components/SignaturePad'
import ConsentText from '../../components/ConsentText'
import FormDiff from '../../components/FormDiff'

// ─── Types ───────────────────────────────────────────────────

interface CustomerIntake {
  firstName: string
  lastName: string
  phone: string
  email: string | null
  address: string | null
  dateOfBirth: string | null
  gender: string | null
  intakeFormData: IntakeFormData
}

interface EditableFields {
  // Health
  hasSpinalProblems: boolean
  hasAllergies: boolean
  hasHighBloodPressure: boolean
  hasBruiseEasily: boolean
  hasVaricoseVeins: boolean
  hasMigraines: boolean
  hasHeartConditions: boolean
  hasInjuries: boolean
  isPregnant: boolean
  pregnancyDueDate: string
  medicalNotes: string
  // Preferences
  preferredMassageType: string
  areasOfPainTension: string
  areasToAvoid: string
  // Consent
  consentAcknowledged: boolean
  clientSignatureDataUrl: string
  guardianSignatureDataUrl: string
  // Minor
  isMinor: boolean
  guardianName: string
}

function fieldsFromIntake(data: IntakeFormData): EditableFields {
  return {
    hasSpinalProblems: data.hasSpinalProblems,
    hasAllergies: data.hasAllergies,
    hasHighBloodPressure: data.hasHighBloodPressure,
    hasBruiseEasily: data.hasBruiseEasily,
    hasVaricoseVeins: data.hasVaricoseVeins,
    hasMigraines: data.hasMigraines,
    hasHeartConditions: data.hasHeartConditions,
    hasInjuries: data.hasInjuries,
    isPregnant: data.isPregnant,
    pregnancyDueDate: data.pregnancyDueDate ?? '',
    medicalNotes: data.medicalNotes,
    preferredMassageType: data.preferredMassageType,
    areasOfPainTension: data.areasOfPainTension,
    areasToAvoid: data.areasToAvoid,
    consentAcknowledged: false,
    clientSignatureDataUrl: '',
    guardianSignatureDataUrl: '',
    isMinor: data.isMinor,
    guardianName: data.guardianName ?? '',
  }
}

// ─── Component ───────────────────────────────────────────────

export default function IntakeEdit() {
  const { storeId, customerId } = useParams()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [customer, setCustomer] = useState<CustomerIntake | null>(null)
  const [fields, setFields] = useState<EditableFields | null>(null)
  const originalRef = useRef<EditableFields | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, boolean>>({})
  const [attempted, setAttempted] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // Load existing data (customer info + intake form)
  useEffect(() => {
    if (!customerId) return
    ;(async () => {
      try {
        const [custRes, intakeRes] = await Promise.all([
          apiFetch<{ customer: { firstName: string; lastName: string; phone: string; email: string | null; address: string | null; dateOfBirth: string | null; gender: string | null } }>(`/api/customers/${customerId}`),
          apiFetch<{ intakeForm: { formData: IntakeFormData } }>(`/api/customers/${customerId}/intake`),
        ])
        const data: CustomerIntake = {
          ...custRes.customer,
          intakeFormData: intakeRes.intakeForm.formData,
        }
        setCustomer(data)
        const editable = fieldsFromIntake(data.intakeFormData)
        setFields(editable)
        originalRef.current = { ...editable }
      } catch {
        // Error is shown via the !customer fallback UI
      } finally {
        setLoading(false)
      }
    })()
  }, [customerId])

  const update = useCallback(
    (patch: Partial<EditableFields>) =>
      setFields((f) => (f ? { ...f, ...patch } : f)),
    [],
  )

  const isChanged = useCallback(
    (field: keyof EditableFields): boolean => {
      if (!fields || !originalRef.current) return false
      return fields[field] !== originalRef.current[field]
    },
    [fields],
  )

  const handleSubmit = useCallback(async () => {
    if (!fields || !customerId) return

    const errs: Record<string, boolean> = {
      consentAcknowledged: !fields.consentAcknowledged,
      clientSignatureDataUrl: !fields.clientSignatureDataUrl,
    }
    if (fields.isMinor) {
      errs.guardianSignatureDataUrl = !fields.guardianSignatureDataUrl
    }
    setErrors(errs)
    setAttempted(true)
    if (Object.values(errs).some(Boolean)) return

    setSubmitting(true)
    setSubmitError('')
    try {
      const intakeFormData: IntakeFormData = {
        hasSpinalProblems: fields.hasSpinalProblems,
        hasAllergies: fields.hasAllergies,
        hasHighBloodPressure: fields.hasHighBloodPressure,
        hasBruiseEasily: fields.hasBruiseEasily,
        hasVaricoseVeins: fields.hasVaricoseVeins,
        hasMigraines: fields.hasMigraines,
        hasHeartConditions: fields.hasHeartConditions,
        hasInjuries: fields.hasInjuries,
        isPregnant: fields.isPregnant,
        pregnancyDueDate: fields.pregnancyDueDate || null,
        medicalNotes: fields.medicalNotes,
        preferredMassageType:
          fields.preferredMassageType as IntakeFormData['preferredMassageType'],
        areasOfPainTension: fields.areasOfPainTension,
        areasToAvoid: fields.areasToAvoid,
        isMinor: fields.isMinor,
        guardianName: fields.guardianName || null,
        guardianSignatureDataUrl:
          fields.guardianSignatureDataUrl || null,
        consentAcknowledged: fields.consentAcknowledged,
        clientSignatureDataUrl: fields.clientSignatureDataUrl,
      }

      await apiFetch(`/api/customers/${customerId}/intake`, {
        method: 'PUT',
        body: JSON.stringify({ formData: intakeFormData }),
      })

      navigate(`/s/${storeId}/intake/thankyou`, {
        state: { firstName: customer?.firstName },
      })
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Update failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }, [fields, customerId, storeId, customer, navigate])

  const inputCls = (field?: string) =>
    `w-full px-4 py-3 rounded-lg border text-base ${
      attempted && field && errors[field]
        ? 'border-red-400 bg-red-50'
        : 'border-gray-200 bg-white'
    } focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary`

  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-lg">Loading...</p>
      </div>
    )
  }

  if (!customer || !fields) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-red-500 text-lg">Failed to load customer data.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Update Intake Form</h1>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="px-4 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm font-medium"
        >
          Cancel
        </button>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        {/* ─── Section 1: Personal Info (read-only) ─── */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Personal Information</h2>
          <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-2 text-sm text-gray-700">
            <p>
              <span className="font-medium">Name:</span> {customer.firstName}{' '}
              {customer.lastName}
            </p>
            <p>
              <span className="font-medium">Phone:</span> {customer.phone}
            </p>
            {customer.email && (
              <p>
                <span className="font-medium">Email:</span> {customer.email}
              </p>
            )}
            {customer.address && (
              <p>
                <span className="font-medium">Address:</span> {customer.address}
              </p>
            )}
            {customer.dateOfBirth && (
              <p>
                <span className="font-medium">Date of Birth:</span>{' '}
                {customer.dateOfBirth}
              </p>
            )}
            {customer.gender && (
              <p>
                <span className="font-medium">Gender:</span>{' '}
                {GENDER_OPTIONS.find((g) => g.value === customer.gender)?.label ??
                  customer.gender}
              </p>
            )}
          </div>
        </section>

        {/* ─── Section 2: Health ─── */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Health Information</h2>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {HEALTH_CONDITIONS.map((cond) => {
                const key = cond.key as keyof EditableFields
                return (
                  <FormDiff key={cond.key} changed={isChanged(key)}>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        className="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary"
                        checked={fields[key] as boolean}
                        onChange={(e) => update({ [key]: e.target.checked })}
                      />
                      <span className="text-sm text-gray-700">{cond.label}</span>
                    </label>
                  </FormDiff>
                )
              })}
            </div>

            <FormDiff changed={isChanged('isPregnant')}>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary"
                  checked={fields.isPregnant}
                  onChange={(e) => update({ isPregnant: e.target.checked })}
                />
                <span className="text-sm text-gray-700">Currently pregnant</span>
              </label>
            </FormDiff>

            {fields.isPregnant && (
              <FormDiff changed={isChanged('pregnancyDueDate')}>
                <label className={labelCls}>Pregnancy Due Date</label>
                <input
                  className={inputCls()}
                  type="date"
                  value={fields.pregnancyDueDate}
                  onChange={(e) => update({ pregnancyDueDate: e.target.value })}
                />
              </FormDiff>
            )}

            <FormDiff changed={isChanged('medicalNotes')}>
              <label className={labelCls}>Additional Medical Notes</label>
              <textarea
                className={inputCls() + ' min-h-[80px] resize-none'}
                value={fields.medicalNotes}
                onChange={(e) => update({ medicalNotes: e.target.value })}
                rows={3}
              />
            </FormDiff>
          </div>
        </section>

        {/* ─── Section 3: Preferences ─── */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Massage Preferences</h2>
          <div className="space-y-4">
            <FormDiff changed={isChanged('preferredMassageType')}>
              <label className={labelCls}>Preferred Massage Type</label>
              <div className="space-y-2">
                {MASSAGE_TYPES.map((mt) => (
                  <label
                    key={mt.value}
                    className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-white cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="massageType"
                      className="w-5 h-5 text-primary focus:ring-primary"
                      value={mt.value}
                      checked={fields.preferredMassageType === mt.value}
                      onChange={() =>
                        update({ preferredMassageType: mt.value })
                      }
                    />
                    <span className="text-sm text-gray-700">{mt.label}</span>
                  </label>
                ))}
              </div>
            </FormDiff>

            <FormDiff changed={isChanged('areasOfPainTension')}>
              <label className={labelCls}>Areas of Pain or Tension</label>
              <textarea
                className={inputCls() + ' min-h-[80px] resize-none'}
                value={fields.areasOfPainTension}
                onChange={(e) =>
                  update({ areasOfPainTension: e.target.value })
                }
                rows={3}
              />
            </FormDiff>

            <FormDiff changed={isChanged('areasToAvoid')}>
              <label className={labelCls}>Areas to Avoid</label>
              <textarea
                className={inputCls() + ' min-h-[80px] resize-none'}
                value={fields.areasToAvoid}
                onChange={(e) => update({ areasToAvoid: e.target.value })}
                rows={3}
              />
            </FormDiff>
          </div>
        </section>

        {/* ─── Section 4: Consent & Signature ─── */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Consent & Signature
          </h2>
          <div className="space-y-4">
            <ConsentText />

            <div className="flex items-center gap-3">
              <input
                id="consentAck"
                type="checkbox"
                className={`w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary ${
                  attempted && errors.consentAcknowledged
                    ? 'ring-2 ring-red-400'
                    : ''
                }`}
                checked={fields.consentAcknowledged}
                onChange={(e) =>
                  update({ consentAcknowledged: e.target.checked })
                }
              />
              <label htmlFor="consentAck" className="text-sm text-gray-700">
                I have read and agree to the above terms
              </label>
            </div>

            <div>
              <label className={labelCls}>Client Signature</label>
              <div
                className={
                  attempted && errors.clientSignatureDataUrl
                    ? 'ring-2 ring-red-400 rounded-lg'
                    : ''
                }
              >
                <SignaturePad
                  value={fields.clientSignatureDataUrl}
                  onChange={(v) => update({ clientSignatureDataUrl: v })}
                />
              </div>
            </div>

            {fields.isMinor && (
              <div>
                <label className={labelCls}>Guardian Signature</label>
                <div
                  className={
                    attempted && errors.guardianSignatureDataUrl
                      ? 'ring-2 ring-red-400 rounded-lg'
                      : ''
                  }
                >
                  <SignaturePad
                    value={fields.guardianSignatureDataUrl}
                    onChange={(v) =>
                      update({ guardianSignatureDataUrl: v })
                    }
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ─── Error ─── */}
        {submitError && (
          <p className="text-red-500 text-sm">{submitError}</p>
        )}

        {/* ─── Actions ─── */}
        <div className="flex justify-between pt-6 border-t border-gray-200">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-6 py-3 rounded-lg border border-gray-200 text-gray-600 text-base font-medium active:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="px-8 py-3 rounded-lg bg-primary text-white text-base font-medium disabled:opacity-50 active:opacity-80"
          >
            {submitting ? 'Saving...' : 'Save & Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
