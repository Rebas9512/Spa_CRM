import { useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  MASSAGE_TYPES,
  HEALTH_CONDITIONS,
  GENDER_OPTIONS,
} from '@spa-crm/shared'
import type { IntakeFormData } from '@spa-crm/shared'
import { useAppStore } from '../../store/appStore'
import { apiFetch } from '../../lib/apiClient'
import SignaturePad from '../../components/SignaturePad'
import ConsentText from '../../components/ConsentText'
import AutoSave, { clearDraft } from '../../components/AutoSave'
import PinPrompt from '../../components/PinPrompt'

// ─── Types ───────────────────────────────────────────────────

interface PersonalInfo {
  firstName: string
  lastName: string
  phone: string
  email: string
  address: string
  dateOfBirth: string
  gender: string
  emergencyContactName: string
  emergencyContactPhone: string
  isMinor: boolean
  guardianName: string
}

interface HealthInfo {
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
}

interface PreferencesInfo {
  preferredMassageType: string
  areasOfPainTension: string
  areasToAvoid: string
}

interface ConsentInfo {
  consentAcknowledged: boolean
  clientSignatureDataUrl: string
  guardianSignatureDataUrl: string
}

type FormData = {
  personal: PersonalInfo
  health: HealthInfo
  preferences: PreferencesInfo
  consent: ConsentInfo
}

function defaultFormData(): FormData {
  return {
    personal: {
      firstName: '',
      lastName: '',
      phone: '',
      email: '',
      address: '',
      dateOfBirth: '',
      gender: '',
      emergencyContactName: '',
      emergencyContactPhone: '',
      isMinor: false,
      guardianName: '',
    },
    health: {
      hasSpinalProblems: false,
      hasAllergies: false,
      hasHighBloodPressure: false,
      hasBruiseEasily: false,
      hasVaricoseVeins: false,
      hasMigraines: false,
      hasHeartConditions: false,
      hasInjuries: false,
      isPregnant: false,
      pregnancyDueDate: '',
      medicalNotes: '',
    },
    preferences: {
      preferredMassageType: 'swedish_relaxation',
      areasOfPainTension: '',
      areasToAvoid: '',
    },
    consent: {
      consentAcknowledged: false,
      clientSignatureDataUrl: '',
      guardianSignatureDataUrl: '',
    },
  }
}

// ─── Validation ──────────────────────────────────────────────

function validateStep1(p: PersonalInfo): Record<string, boolean> {
  return {
    firstName: p.firstName.trim().length === 0,
    lastName: p.lastName.trim().length === 0,
    phone: p.phone.replace(/\D/g, '').length < 10,
    dateOfBirth: p.dateOfBirth.trim().length === 0,
    gender: p.gender.trim().length === 0,
    emergencyContactName: p.emergencyContactName.trim().length === 0,
    emergencyContactPhone: p.emergencyContactPhone.replace(/\D/g, '').length < 10,
  }
}

function validateStep4(c: ConsentInfo, isMinor: boolean): Record<string, boolean> {
  const errs: Record<string, boolean> = {
    consentAcknowledged: !c.consentAcknowledged,
    clientSignatureDataUrl: !c.clientSignatureDataUrl,
  }
  if (isMinor) {
    errs.guardianSignatureDataUrl = !c.guardianSignatureDataUrl
  }
  return errs
}

function hasErrors(errs: Record<string, boolean>): boolean {
  return Object.values(errs).some(Boolean)
}

// ─── Progress Dots ───────────────────────────────────────────

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-500">
        Step {current} of {total}
      </span>
      <div className="flex gap-2">
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            className={`w-3 h-3 rounded-full ${
              i < current ? 'bg-primary' : 'bg-gray-200'
            }`}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────

export default function IntakeForm() {
  const { storeId } = useParams()
  const navigate = useNavigate()
  const pendingAssignment = useAppStore((s) => s.pendingAssignment)
  const setPendingAssignment = useAppStore((s) => s.setPendingAssignment)
  const setAccessLevel = useAppStore((s) => s.setAccessLevel)

  const [step, setStep] = useState(1)
  const [form, setForm] = useState<FormData>(defaultFormData)
  const [errors, setErrors] = useState<Record<string, boolean>>({})
  const [submitting, setSubmitting] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [showExitPin, setShowExitPin] = useState(false)

  const draftKey = `intake-new-${storeId ?? 'unknown'}`

  const handleRestore = useCallback((data: unknown) => {
    if (data && typeof data === 'object') {
      setForm(data as FormData)
    }
  }, [])

  // Updaters
  const updatePersonal = useCallback(
    (patch: Partial<PersonalInfo>) =>
      setForm((f) => ({ ...f, personal: { ...f.personal, ...patch } })),
    [],
  )
  const updateHealth = useCallback(
    (patch: Partial<HealthInfo>) =>
      setForm((f) => ({ ...f, health: { ...f.health, ...patch } })),
    [],
  )
  const updatePrefs = useCallback(
    (patch: Partial<PreferencesInfo>) =>
      setForm((f) => ({ ...f, preferences: { ...f.preferences, ...patch } })),
    [],
  )
  const updateConsent = useCallback(
    (patch: Partial<ConsentInfo>) =>
      setForm((f) => ({ ...f, consent: { ...f.consent, ...patch } })),
    [],
  )

  // Navigation
  const goNext = useCallback(() => {
    if (step === 1) {
      const errs = validateStep1(form.personal)
      setErrors(errs)
      setAttempted(true)
      if (hasErrors(errs)) return
    }
    setAttempted(false)
    setErrors({})
    setStep((s) => Math.min(s + 1, 4))
  }, [step, form.personal])

  const goBack = useCallback(() => {
    setAttempted(false)
    setErrors({})
    setStep((s) => Math.max(s - 1, 1))
  }, [])

  // Submit
  const handleSubmit = useCallback(async () => {
    const errs = validateStep4(form.consent, form.personal.isMinor)
    setErrors(errs)
    setAttempted(true)
    if (hasErrors(errs)) return

    setSubmitting(true)
    try {
      const intakeFormData: IntakeFormData = {
        // Health
        hasSpinalProblems: form.health.hasSpinalProblems,
        hasAllergies: form.health.hasAllergies,
        hasHighBloodPressure: form.health.hasHighBloodPressure,
        hasBruiseEasily: form.health.hasBruiseEasily,
        hasVaricoseVeins: form.health.hasVaricoseVeins,
        hasMigraines: form.health.hasMigraines,
        hasHeartConditions: form.health.hasHeartConditions,
        hasInjuries: form.health.hasInjuries,
        isPregnant: form.health.isPregnant,
        pregnancyDueDate: form.health.pregnancyDueDate || null,
        medicalNotes: form.health.medicalNotes,
        // Preferences
        preferredMassageType: form.preferences
          .preferredMassageType as IntakeFormData['preferredMassageType'],
        areasOfPainTension: form.preferences.areasOfPainTension,
        areasToAvoid: form.preferences.areasToAvoid,
        // Minor
        isMinor: form.personal.isMinor,
        guardianName: form.personal.guardianName || null,
        guardianSignatureDataUrl:
          form.consent.guardianSignatureDataUrl || null,
        // Consent
        consentAcknowledged: form.consent.consentAcknowledged,
        clientSignatureDataUrl: form.consent.clientSignatureDataUrl,
      }

      await apiFetch('/api/customers', {
        method: 'POST',
        body: JSON.stringify({
          firstName: form.personal.firstName.trim(),
          lastName: form.personal.lastName.trim(),
          phone: form.personal.phone.replace(/\D/g, ''),
          email: form.personal.email || undefined,
          address: form.personal.address || undefined,
          dateOfBirth: form.personal.dateOfBirth || undefined,
          gender: form.personal.gender || undefined,
          emergencyContactName: form.personal.emergencyContactName || undefined,
          emergencyContactPhone: form.personal.emergencyContactPhone
            ? form.personal.emergencyContactPhone.replace(/\D/g, '')
            : undefined,
          intakeFormData,
          firstVisit: pendingAssignment
            ? {
                serviceType: pendingAssignment.serviceType,
                therapistName: pendingAssignment.therapistName,
              }
            : { serviceType: MASSAGE_TYPES[0].value, therapistName: '' },
        }),
      })

      clearDraft(draftKey)
      setPendingAssignment(null)
      navigate(`/s/${storeId}/intake/thankyou`, {
        state: { firstName: form.personal.firstName.trim() },
      })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Submission failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }, [form, pendingAssignment, setPendingAssignment, storeId, navigate, draftKey])

  // Shared input class
  const inputCls = (field?: string) =>
    `w-full px-4 py-3 rounded-lg border text-base ${
      attempted && field && errors[field]
        ? 'border-red-400 bg-red-50'
        : 'border-gray-200 bg-white'
    } focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary`

  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <div className="min-h-screen bg-gray-50">
      <AutoSave formKey={draftKey} data={form} onRestore={handleRestore} />

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between relative">
        <button
          onClick={() => setShowExitPin(true)}
          className="text-sm font-medium text-gray-400 active:text-gray-600"
        >
          &larr; Exit
        </button>
        <h1 className="text-xl font-semibold text-gray-900 absolute left-1/2 -translate-x-1/2">
          New Client Intake Form
        </h1>
        <ProgressDots current={step} total={4} />
      </div>

      {/* Body */}
      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* ─── STEP 1: Personal Info ─── */}
        {step === 1 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-gray-900">Personal Information</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>
                  First Name <span className="text-red-500">*</span>
                </label>
                <input
                  className={inputCls('firstName')}
                  value={form.personal.firstName}
                  onChange={(e) => updatePersonal({ firstName: e.target.value })}
                  placeholder="First name"
                />
              </div>
              <div>
                <label className={labelCls}>
                  Last Name <span className="text-red-500">*</span>
                </label>
                <input
                  className={inputCls('lastName')}
                  value={form.personal.lastName}
                  onChange={(e) => updatePersonal({ lastName: e.target.value })}
                  placeholder="Last name"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>
                  Phone <span className="text-red-500">*</span>
                </label>
                <input
                  className={inputCls('phone')}
                  value={form.personal.phone}
                  onChange={(e) =>
                    updatePersonal({ phone: e.target.value.replace(/\D/g, '').slice(0, 10) })
                  }
                  placeholder="(555) 000-0000"
                  type="tel"
                  inputMode="numeric"
                />
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input
                  className={inputCls()}
                  value={form.personal.email}
                  onChange={(e) => updatePersonal({ email: e.target.value })}
                  placeholder="email@example.com"
                  type="email"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Address</label>
                <input
                  className={inputCls()}
                  value={form.personal.address}
                  onChange={(e) => updatePersonal({ address: e.target.value })}
                  placeholder="Street address"
                />
              </div>
              <div>
                <label className={labelCls}>
                  Date of Birth <span className="text-red-500">*</span>
                </label>
                <input
                  className={inputCls('dateOfBirth')}
                  type="date"
                  value={form.personal.dateOfBirth}
                  onChange={(e) => updatePersonal({ dateOfBirth: e.target.value })}
                  placeholder="MM/DD/YYYY"
                />
              </div>
            </div>

            <div>
              <label className={labelCls}>
                Gender <span className="text-red-500">*</span>
              </label>
              <select
                className={inputCls('gender')}
                value={form.personal.gender}
                onChange={(e) => updatePersonal({ gender: e.target.value })}
              >
                <option value="">Select gender</option>
                {GENDER_OPTIONS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>
                  Emergency Contact Name <span className="text-red-500">*</span>
                </label>
                <input
                  className={inputCls('emergencyContactName')}
                  value={form.personal.emergencyContactName}
                  onChange={(e) => updatePersonal({ emergencyContactName: e.target.value })}
                  placeholder="Emergency contact name"
                />
              </div>
              <div>
                <label className={labelCls}>
                  Emergency Contact Phone <span className="text-red-500">*</span>
                </label>
                <input
                  className={inputCls('emergencyContactPhone')}
                  value={form.personal.emergencyContactPhone}
                  onChange={(e) =>
                    updatePersonal({ emergencyContactPhone: e.target.value.replace(/\D/g, '').slice(0, 11) })
                  }
                  placeholder="Emergency contact phone"
                  type="tel"
                  inputMode="numeric"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <input
                id="isMinor"
                type="checkbox"
                className="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary"
                checked={form.personal.isMinor}
                onChange={(e) => updatePersonal({ isMinor: e.target.checked })}
              />
              <label htmlFor="isMinor" className="text-sm text-gray-700">
                I am under 17 years old
              </label>
            </div>

            {form.personal.isMinor && (
              <div>
                <label className={labelCls}>Guardian Name</label>
                <input
                  className={inputCls()}
                  value={form.personal.guardianName}
                  onChange={(e) => updatePersonal({ guardianName: e.target.value })}
                  placeholder="Guardian full name"
                />
              </div>
            )}
          </div>
        )}

        {/* ─── STEP 2: Health ─── */}
        {step === 2 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-gray-900">Health Information</h2>
            <div className="grid grid-cols-2 gap-3">
              {HEALTH_CONDITIONS.map((cond) => (
                <label
                  key={cond.key}
                  className="flex items-center gap-3 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                    checked={form.health[cond.key as keyof HealthInfo] as boolean}
                    onChange={(e) =>
                      updateHealth({ [cond.key]: e.target.checked })
                    }
                  />
                  <span className="text-sm text-gray-700">{cond.label}</span>
                </label>
              ))}
            </div>

            <div className="flex items-center gap-4 pt-2">
              <div className="flex items-center gap-3">
                <input
                  id="isPregnant"
                  type="checkbox"
                  className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                  checked={form.health.isPregnant}
                  onChange={(e) => updateHealth({ isPregnant: e.target.checked })}
                />
                <label htmlFor="isPregnant" className="text-sm text-gray-700">
                  Currently pregnant?
                </label>
              </div>
              {form.health.isPregnant && (
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-500">Due Date</label>
                  <input
                    className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    type="date"
                    value={form.health.pregnancyDueDate}
                    onChange={(e) =>
                      updateHealth({ pregnancyDueDate: e.target.value })
                    }
                    placeholder="MM/DD/YYYY"
                  />
                </div>
              )}
            </div>

            <div>
              <label className={labelCls}>Medical Notes</label>
              <textarea
                className={inputCls() + ' min-h-[100px] resize-none'}
                value={form.health.medicalNotes}
                onChange={(e) => updateHealth({ medicalNotes: e.target.value })}
                placeholder="Add any additional medical notes or concerns..."
                rows={4}
              />
            </div>
          </div>
        )}

        {/* ─── STEP 3: Preferences ─── */}
        {step === 3 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-gray-900">Massage Preferences</h2>

            <div>
              <label className={labelCls}>Service Type</label>
              <div className="grid grid-cols-2 gap-3 mt-1">
                {MASSAGE_TYPES.map((mt) => (
                  <label
                    key={mt.value}
                    className="flex items-center gap-3 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="massageType"
                      className="w-4 h-4 text-primary focus:ring-primary"
                      value={mt.value}
                      checked={form.preferences.preferredMassageType === mt.value}
                      onChange={() =>
                        updatePrefs({ preferredMassageType: mt.value })
                      }
                    />
                    <span className="text-sm text-gray-700">{mt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className={labelCls}>Areas of pain or tension</label>
              <textarea
                className={inputCls() + ' min-h-[80px] resize-none'}
                value={form.preferences.areasOfPainTension}
                onChange={(e) =>
                  updatePrefs({ areasOfPainTension: e.target.value })
                }
                placeholder="Describe any areas of pain or tension..."
                rows={3}
              />
            </div>

            <div>
              <label className={labelCls}>Areas to avoid</label>
              <textarea
                className={inputCls() + ' min-h-[80px] resize-none'}
                value={form.preferences.areasToAvoid}
                onChange={(e) => updatePrefs({ areasToAvoid: e.target.value })}
                placeholder="List any areas the therapist should avoid..."
                rows={3}
              />
            </div>
          </div>
        )}

        {/* ─── STEP 4: Consent ─── */}
        {step === 4 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-gray-900">Consent & Signature</h2>
            <p className="text-sm text-gray-500">
              Please read the following carefully and sign below.
            </p>

            <ConsentText />

            <div className="flex items-center gap-3">
              <input
                id="consentAck"
                type="checkbox"
                className={`w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary ${
                  attempted && errors.consentAcknowledged ? 'ring-2 ring-red-400' : ''
                }`}
                checked={form.consent.consentAcknowledged}
                onChange={(e) =>
                  updateConsent({ consentAcknowledged: e.target.checked })
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
                  value={form.consent.clientSignatureDataUrl}
                  onChange={(v) =>
                    updateConsent({ clientSignatureDataUrl: v })
                  }
                />
              </div>
            </div>

            {form.personal.isMinor && (
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
                    value={form.consent.guardianSignatureDataUrl}
                    onChange={(v) =>
                      updateConsent({ guardianSignatureDataUrl: v })
                    }
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Navigation buttons ─── */}
        <div className="flex justify-between mt-8 pt-6 border-t border-gray-200">
          {step > 1 ? (
            <button
              type="button"
              onClick={goBack}
              className="px-6 py-3 rounded-lg border border-gray-200 text-gray-600 text-base font-medium active:bg-gray-50"
            >
              &larr; Back
            </button>
          ) : (
            <div />
          )}

          {step < 4 ? (
            <button
              type="button"
              onClick={goNext}
              className="px-8 py-3 rounded-lg bg-primary text-white text-base font-medium active:opacity-80"
            >
              Next &rarr;
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="px-8 py-3 rounded-lg bg-primary text-white text-base font-medium disabled:opacity-50 active:opacity-80"
            >
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
          )}
        </div>
      </div>

      {showExitPin && (
        <PinPrompt
          onSuccess={() => {
            setShowExitPin(false)
            clearDraft(draftKey)
            setPendingAssignment(null)
            setAccessLevel('staff')
            navigate(`/s/${storeId}/`)
          }}
          onCancel={() => setShowExitPin(false)}
        />
      )}
    </div>
  )
}
