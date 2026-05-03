import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../../lib/apiClient'
import { formatLocalTime } from '../../lib/timezone'
import { useTranslation } from '../../i18n'
import {
  HEALTH_CONDITIONS,
  HIGH_RISK_CONDITIONS,
  GENDER_OPTIONS,
  SERVICE_MENU_ITEMS,
} from '@spa-crm/shared'

const BODY_PARTS_OPTIONS = ['Chair', 'Foot', 'Body', 'Combo', 'Head'] as const
const TECHNIQUE_CATEGORIES = ['Chair', 'Foot', 'Combo', 'Body', 'Head'] as const
import VisitHistory from '../../components/VisitHistory'
import type { VisitRecord } from '../../components/VisitHistory'
import { generateConsentPdf } from '../../components/ConsentFormPdf'
import type { ConsentPdfData } from '../../components/ConsentFormPdf'
import type { HealthAlerts } from '../../components/HealthAlertBadge'
import type { IntakeFormData } from '@spa-crm/shared'

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------
interface CustomerData {
  id: string
  firstName: string
  lastName: string
  phone: string
  email: string | null
  address: string | null
  dateOfBirth: string | null
  gender: string | null
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  staffNotes: string | null
  loyaltyPoints: number
  loyaltyImportedAt: string | null
  createdAt: string
  updatedAt: string
}

interface IntakeFormResponse {
  id: string
  customerId: string
  formVersion: number
  formData: IntakeFormData
  status: string
  clientSignedAt: string | null
  lastReviewedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

interface VisitApiRecord {
  id: string
  visitDate: string
  serviceType: string | null
  therapistName: string | null
  storeName: string | null
  therapistServiceTechnique: string | null
  therapistBodyPartsNotes: string | null
  therapistSignedAt: string | null
  pointsRedeemed: number
  pointsAfter: number | null
  cancelledAt: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function deriveStatus(v: VisitApiRecord): 'active' | 'completed' | 'cancelled' {
  if (v.cancelledAt) return 'cancelled'
  if (v.therapistSignedAt) return 'completed'
  return 'active'
}

function toVisitRecords(visits: VisitApiRecord[]): VisitRecord[] {
  return visits.map((v) => ({
    id: v.id,
    visitDate: v.visitDate,
    serviceType: v.serviceType,
    therapistServiceTechnique: v.therapistServiceTechnique,
    therapistBodyPartsNotes: v.therapistBodyPartsNotes ?? null,
    therapistName: v.therapistName,
    storeName: v.storeName,
    therapistSignedAt: v.therapistSignedAt,
    pointsRedeemed: v.pointsRedeemed ?? 0,
    pointsAfter: v.pointsAfter ?? null,
    cancelledAt: v.cancelledAt,
  }))
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function AdminCustomerDetail() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const params = useParams<{ id: string; storeId: string }>()
  const customerId = params.id

  // Notes editing state
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesValue, setNotesValue] = useState('')
  const [showModifyPoints, setShowModifyPoints] = useState(false)
  const [modifyPointsValue, setModifyPointsValue] = useState('')
  const [modifyPin, setModifyPin] = useState('')
  const [modifyError, setModifyError] = useState('')

  // Edit basic info modal state
  const [showEditInfo, setShowEditInfo] = useState(false)
  const [editInfoForm, setEditInfoForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    address: '',
    dateOfBirth: '',
    gender: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
  })
  const [editInfoPin, setEditInfoPin] = useState('')
  const [editInfoError, setEditInfoError] = useState('')

  // Edit visit modal state
  const [editVisitId, setEditVisitId] = useState<string | null>(null)
  const [editVisitForm, setEditVisitForm] = useState<{
    therapistName: string
    therapistServiceTechnique: string
    bodyParts: string[]
  }>({
    therapistName: '',
    therapistServiceTechnique: '',
    bodyParts: [],
  })
  const [editVisitMeta, setEditVisitMeta] = useState<{ date: string; rawBodyParts: string; unrecognized: string[] }>({
    date: '',
    rawBodyParts: '',
    unrecognized: [],
  })
  const [editVisitPin, setEditVisitPin] = useState('')
  const [editVisitError, setEditVisitError] = useState('')

  // ---- Queries ----
  const customerQuery = useQuery({
    queryKey: ['admin-customer', customerId],
    queryFn: () =>
      apiFetch<{ customer: CustomerData }>(`/api/manage/customers/${customerId}`),
    enabled: !!customerId,
  })

  const intakeQuery = useQuery({
    queryKey: ['admin-customer-intake', customerId],
    queryFn: () =>
      apiFetch<{ intakeForm: IntakeFormResponse }>(
        `/api/manage/customers/${customerId}/intake`,
      ).catch(() => null),
    enabled: !!customerId,
  })

  const visitsQuery = useQuery({
    queryKey: ['admin-customer-visits', customerId],
    queryFn: () =>
      apiFetch<{ visits: VisitApiRecord[] }>(
        `/api/manage/customers/${customerId}/visits`,
      ),
    enabled: !!customerId,
  })

  // ---- Mutations ----
  const notesMutation = useMutation({
    mutationFn: (notes: string) =>
      apiFetch(`/api/manage/customers/${customerId}/notes`, {
        method: 'PATCH',
        body: JSON.stringify({ staffNotes: notes }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['admin-customer', customerId],
      })
      setEditingNotes(false)
    },
  })

  const modifyPointsMutation = useMutation({
    mutationFn: (data: { loyaltyPoints: number; pin: string }) =>
      apiFetch<{ loyaltyPoints: number }>(`/api/manage/customers/${customerId}/loyalty-points`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-customer', customerId] })
      setShowModifyPoints(false)
      setModifyPointsValue('')
      setModifyPin('')
      setModifyError('')
    },
    onError: (err: Error) => {
      setModifyError(err.message?.includes('PIN')
        ? t('profile.pinIncorrect')
        : t('common.saveFailed'))
    },
  })

  const editInfoMutation = useMutation({
    mutationFn: (payload: typeof editInfoForm & { pin: string }) =>
      apiFetch(`/api/manage/customers/${customerId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-customer', customerId] })
      setShowEditInfo(false)
      setEditInfoPin('')
      setEditInfoError('')
    },
    onError: (err: Error) => {
      const msg = err.message || ''
      if (msg.includes('PIN')) setEditInfoError(t('profile.pinIncorrect'))
      else if (msg.includes('Phone already in use')) setEditInfoError(t('profile.phoneInUse'))
      else if (msg.includes('Invalid phone')) setEditInfoError(t('profile.invalidPhone'))
      else setEditInfoError(t('common.saveFailed'))
    },
  })

  const editVisitMutation = useMutation({
    mutationFn: (payload: {
      visitId: string
      therapistName: string
      therapistServiceTechnique: string
      therapistBodyPartsNotes: string
      pin: string
    }) =>
      apiFetch(`/api/manage/visits/${payload.visitId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          therapistName: payload.therapistName,
          therapistServiceTechnique: payload.therapistServiceTechnique,
          therapistBodyPartsNotes: payload.therapistBodyPartsNotes,
          pin: payload.pin,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-customer-visits', customerId] })
      queryClient.invalidateQueries({ queryKey: ['admin-customer', customerId] })
      setEditVisitId(null)
      setEditVisitPin('')
      setEditVisitError('')
    },
    onError: (err: Error) => {
      const msg = err.message || ''
      if (msg.includes('PIN')) setEditVisitError(t('profile.pinIncorrect'))
      else if (msg.includes('Insufficient balance')) setEditVisitError(t('visit.insufficientBalance'))
      else if (msg.includes('not completed')) setEditVisitError(t('visit.notCompleted'))
      else setEditVisitError(t('common.saveFailed'))
    },
  })

  // ---- Derived data ----
  const customer = customerQuery.data?.customer
  const intakeForm = intakeQuery.data?.intakeForm ?? null
  const formData = intakeForm?.formData ?? null
  const visits = visitsQuery.data?.visits ?? []
  const visitRecords = toVisitRecords(visits)

  // Health alerts from intake form
  const healthAlerts: HealthAlerts = formData
    ? {
        hasSpinalProblems: formData.hasSpinalProblems,
        hasAllergies: formData.hasAllergies,
        hasHighBloodPressure: formData.hasHighBloodPressure,
        hasBruiseEasily: formData.hasBruiseEasily,
        hasVaricoseVeins: formData.hasVaricoseVeins,
        hasMigraines: formData.hasMigraines,
        hasHeartConditions: formData.hasHeartConditions,
        hasInjuries: formData.hasInjuries,
        isPregnant: formData.isPregnant,
      }
    : {}

  // ---- PDF export ----
  const handleExportPdf = async () => {
    if (!customer || !intakeForm || !formData) return

    // Get store name from the most recent visit or fallback
    const storeName = visits.find((v) => v.storeName)?.storeName ?? ''

    const pdfData: ConsentPdfData = {
      storeName,
      firstName: customer.firstName,
      lastName: customer.lastName,
      phone: customer.phone,
      email: customer.email,
      dateOfBirth: customer.dateOfBirth,
      address: customer.address,
      gender: customer.gender,
      emergencyContactName: customer.emergencyContactName,
      emergencyContactPhone: customer.emergencyContactPhone,
      hasSpinalProblems: formData.hasSpinalProblems,
      hasAllergies: formData.hasAllergies,
      hasHighBloodPressure: formData.hasHighBloodPressure,
      hasBruiseEasily: formData.hasBruiseEasily,
      hasVaricoseVeins: formData.hasVaricoseVeins,
      hasMigraines: formData.hasMigraines,
      hasHeartConditions: formData.hasHeartConditions,
      hasInjuries: formData.hasInjuries,
      isPregnant: formData.isPregnant,
      medicalNotes: formData.medicalNotes,
      preferredMassageType: formData.preferredMassageType,
      areasOfPainTension: formData.areasOfPainTension,
      areasToAvoid: formData.areasToAvoid,
      consentAcknowledged: formData.consentAcknowledged,
      signatureDataUrl: formData.clientSignatureDataUrl,
      clientSignedAt: intakeForm.clientSignedAt,
      status: intakeForm.status,
      lastReviewedAt: intakeForm.lastReviewedAt,
      totalVisits: visits.length,
    }

    await generateConsentPdf(pdfData)
  }

  // ---- Loading state ----
  if (!customer) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <span className="text-gray-400">{t('common.loading')}</span>
      </div>
    )
  }

  // ---- Health summary badges ----
  const activeConditions = formData
    ? HEALTH_CONDITIONS.filter(
        (c) => formData[c.key as keyof IntakeFormData] === true,
      )
    : []

  const noConditions = activeConditions.length === 0 && !formData?.isPregnant

  // Positive badges (things that are NOT flagged)
  const positiveBadges: Array<{ key: string; label: string }> = []
  if (formData && !formData.hasAllergies) {
    positiveBadges.push({ key: 'noAllergies', label: t('health.noAllergies') })
  }

  // Warning badges
  const warningBadges: Array<{ key: string; label: string }> = activeConditions
    .filter((c) =>
      (HIGH_RISK_CONDITIONS as readonly string[]).includes(c.key),
    )
    .map((c) => ({
      key: c.key as string,
      label: t(`health.${c.key}`) === `health.${c.key}` ? c.label : t(`health.${c.key}`),
    }))

  if (formData?.isPregnant) {
    warningBadges.push({ key: 'isPregnant', label: t('health.pregnant') })
  }

  // Non-high-risk conditions
  const infoBadges = activeConditions
    .filter(
      (c) => !(HIGH_RISK_CONDITIONS as readonly string[]).includes(c.key),
    )
    .map((c) => ({
      key: c.key,
      label: t(`health.${c.key}`) === `health.${c.key}` ? c.label : t(`health.${c.key}`),
    }))

  // Areas to avoid badges
  const avoidBadges: Array<{ key: string; label: string }> = []
  if (formData?.areasToAvoid) {
    avoidBadges.push({
      key: 'areasToAvoid',
      label: `${t('health.areasToAvoid')}: ${formData.areasToAvoid}`,
    })
  }

  // Form status badge
  const formStatusBadge = intakeForm
    ? intakeForm.status === 'completed'
      ? { bg: '#DCFCE7', color: '#16A34A', label: t('status.completed') }
      : { bg: '#DBEAFE', color: '#1D4ED8', label: 'Client Signed' }
    : null

  // Initials
  const initials = `${customer.firstName.charAt(0)}${customer.lastName.charAt(0)}`.toUpperCase()

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-['Inter',sans-serif]">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="text-[#0F766E] font-medium text-sm hover:underline"
        >
          &larr; {t('admin.backToCustomers')}
        </button>

        {intakeForm && (
          <button
            onClick={handleExportPdf}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-[#0F766E] rounded-lg hover:bg-teal-50 transition-colors"
          >
            {/* file-text icon */}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#0F766E"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <span className="text-[13px] font-semibold text-[#0F766E]">
              {t('btn.exportPdf')}
            </span>
          </button>
        )}
      </header>

      {/* Two-column layout */}
      <div className="flex-1 p-6 flex gap-6 max-w-[1400px] mx-auto w-full">
        {/* Left column — fixed 360px */}
        <div className="w-[360px] flex-shrink-0 flex flex-col gap-6">
          {/* Card 1: Customer Info */}
          <div className="bg-[#FAFAFA] border border-gray-200 rounded-xl p-5 flex flex-col gap-3">
            {/* Avatar + Name */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-full bg-[#CCFBF1] flex items-center justify-center flex-shrink-0">
                  <span className="text-[#0F766E] text-base font-bold">
                    {initials}
                  </span>
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-[#0D0D0D] truncate">
                    {customer.firstName} {customer.lastName}
                  </h2>
                  <p className="text-xs text-gray-500 truncate">
                    {customer.phone}
                    {customer.email ? ` \u00B7 ${customer.email}` : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setEditInfoForm({
                    firstName: customer.firstName ?? '',
                    lastName: customer.lastName ?? '',
                    phone: customer.phone ?? '',
                    email: customer.email ?? '',
                    address: customer.address ?? '',
                    dateOfBirth: customer.dateOfBirth ?? '',
                    gender: customer.gender ?? '',
                    emergencyContactName: customer.emergencyContactName ?? '',
                    emergencyContactPhone: customer.emergencyContactPhone ?? '',
                  })
                  setEditInfoPin('')
                  setEditInfoError('')
                  setShowEditInfo(true)
                }}
                className="flex items-center gap-1 px-2 py-1 border border-gray-200 rounded-md hover:bg-gray-100 transition-colors flex-shrink-0"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#374151"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                <span className="text-xs text-gray-700">{t('profile.editInfo')}</span>
              </button>
            </div>

            {/* Detail rows */}
            <div className="flex flex-col gap-2 mt-1">
              <DetailRow
                label={t('profile.address')}
                value={customer.address}
              />
              <DetailRow
                label={t('profile.dob')}
                value={customer.dateOfBirth}
              />
              <DetailRow
                label={t('admin.gender')}
                value={customer.gender}
              />
              <DetailRow
                label={t('admin.emergency')}
                value={
                  customer.emergencyContactName
                    ? `${customer.emergencyContactName} (${customer.emergencyContactPhone ?? ''})`
                    : null
                }
              />
              <div className="flex items-center justify-between py-1">
                <div>
                  <span className="text-xs text-[#6B7280]">{t('profile.loyaltyPoints')}</span>
                  <p className={`text-sm font-medium ${(customer.loyaltyPoints ?? 0) >= 10 ? 'text-amber-600' : 'text-[#0D0D0D]'}`}>
                    {customer.loyaltyPoints ?? 0}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setModifyPointsValue(String(customer.loyaltyPoints ?? 0))
                    setShowModifyPoints(true)
                    setModifyError('')
                  }}
                  className="text-xs text-[#0F766E] font-medium hover:underline"
                >
                  {t('profile.modifyPoints')}
                </button>
              </div>
            </div>
          </div>

          {/* Edit Info Modal */}
          {showEditInfo && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto space-y-4">
                <h3 className="text-lg font-semibold text-gray-900">{t('profile.editInfoTitle')}</h3>
                <p className="text-sm text-gray-500">{t('profile.editInfoDesc')}</p>

                <div className="grid grid-cols-2 gap-3">
                  <EditField
                    label={t('profile.firstName')}
                    required
                    value={editInfoForm.firstName}
                    onChange={(v) => { setEditInfoForm((f) => ({ ...f, firstName: v })); setEditInfoError('') }}
                  />
                  <EditField
                    label={t('profile.lastName')}
                    required
                    value={editInfoForm.lastName}
                    onChange={(v) => { setEditInfoForm((f) => ({ ...f, lastName: v })); setEditInfoError('') }}
                  />
                </div>

                <EditField
                  label={t('profile.phone')}
                  required
                  type="tel"
                  value={editInfoForm.phone}
                  onChange={(v) => { setEditInfoForm((f) => ({ ...f, phone: v })); setEditInfoError('') }}
                />

                <EditField
                  label={t('profile.email')}
                  type="email"
                  value={editInfoForm.email}
                  onChange={(v) => { setEditInfoForm((f) => ({ ...f, email: v })); setEditInfoError('') }}
                />

                <EditField
                  label={t('profile.address')}
                  value={editInfoForm.address}
                  onChange={(v) => { setEditInfoForm((f) => ({ ...f, address: v })); setEditInfoError('') }}
                />

                <div className="grid grid-cols-2 gap-3">
                  <EditField
                    label={t('profile.dob')}
                    type="date"
                    value={editInfoForm.dateOfBirth}
                    onChange={(v) => { setEditInfoForm((f) => ({ ...f, dateOfBirth: v })); setEditInfoError('') }}
                  />
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-600">{t('admin.gender')}</label>
                    <select
                      value={editInfoForm.gender}
                      onChange={(e) => { setEditInfoForm((f) => ({ ...f, gender: e.target.value })); setEditInfoError('') }}
                      className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0F766E] bg-white"
                    >
                      <option value="">{t('profile.genderUnset')}</option>
                      {GENDER_OPTIONS.map((g) => (
                        <option key={g.value} value={g.value}>
                          {t(`profile.gender${g.value === 'male' ? 'Male' : g.value === 'female' ? 'Female' : g.value === 'non_binary' ? 'NonBinary' : 'PreferNot'}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <EditField
                    label={t('profile.emergencyName')}
                    value={editInfoForm.emergencyContactName}
                    onChange={(v) => { setEditInfoForm((f) => ({ ...f, emergencyContactName: v })); setEditInfoError('') }}
                  />
                  <EditField
                    label={t('profile.emergencyPhone')}
                    type="tel"
                    value={editInfoForm.emergencyContactPhone}
                    onChange={(v) => { setEditInfoForm((f) => ({ ...f, emergencyContactPhone: v })); setEditInfoError('') }}
                  />
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <EditField
                    label={t('profile.adminPin')}
                    required
                    type="password"
                    value={editInfoPin}
                    onChange={(v) => { setEditInfoPin(v); setEditInfoError('') }}
                  />
                </div>

                {editInfoError && <p className="text-red-500 text-sm">{editInfoError}</p>}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => { setShowEditInfo(false); setEditInfoPin(''); setEditInfoError('') }}
                    className="flex-1 py-2.5 border border-gray-200 rounded-lg text-gray-700 font-medium text-sm"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={() => {
                      const f = editInfoForm
                      if (!f.firstName.trim() || !f.lastName.trim() || !f.phone.trim() || !editInfoPin) {
                        setEditInfoError(t('profile.fieldRequired'))
                        return
                      }
                      const phoneDigits = f.phone.replace(/\D/g, '')
                      if (phoneDigits.length < 10 || phoneDigits.length > 11) {
                        setEditInfoError(t('profile.invalidPhone'))
                        return
                      }
                      editInfoMutation.mutate({ ...f, pin: editInfoPin })
                    }}
                    disabled={editInfoMutation.isPending}
                    className="flex-1 py-2.5 bg-[#0F766E] text-white rounded-lg font-medium text-sm disabled:opacity-50"
                  >
                    {editInfoMutation.isPending ? t('common.saving') : t('common.save')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modify Points Modal */}
          {showModifyPoints && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white rounded-xl p-6 mx-4 max-w-sm w-full space-y-4">
                <h3 className="text-lg font-semibold text-gray-900">{t('profile.modifyPoints')}</h3>
                <p className="text-sm text-gray-500">{t('profile.modifyPointsDesc')}</p>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={modifyPointsValue}
                  onChange={(e) => { setModifyPointsValue(e.target.value); setModifyError('') }}
                  placeholder={t('profile.loyaltyPoints')}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                />
                <input
                  type="password"
                  value={modifyPin}
                  onChange={(e) => { setModifyPin(e.target.value); setModifyError('') }}
                  placeholder={t('profile.pinPlaceholder')}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                />
                {modifyError && <p className="text-red-500 text-sm">{modifyError}</p>}
                <div className="flex gap-3">
                  <button
                    onClick={() => { setShowModifyPoints(false); setModifyPin(''); setModifyError('') }}
                    className="flex-1 py-2.5 border border-gray-200 rounded-lg text-gray-700 font-medium text-sm"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={() => {
                      const pts = parseInt(modifyPointsValue, 10)
                      if (isNaN(pts) || pts < 0 || !modifyPin) return
                      modifyPointsMutation.mutate({ loyaltyPoints: pts, pin: modifyPin })
                    }}
                    disabled={modifyPointsMutation.isPending}
                    className="flex-1 py-2.5 bg-[#0F766E] text-white rounded-lg font-medium text-sm disabled:opacity-50"
                  >
                    {modifyPointsMutation.isPending ? t('common.saving') : t('common.save')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Edit Visit Modal */}
          {editVisitId && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{t('visit.editTitle')}</h3>
                  {editVisitMeta.date && (
                    <p className="text-xs text-gray-500 mt-1">
                      {t('visit.editingContext').replace('{date}', editVisitMeta.date)}
                    </p>
                  )}
                </div>
                <p className="text-sm text-gray-500 leading-relaxed">{t('visit.editDesc')}</p>

                <EditField
                  label={t('visit.therapistName')}
                  required
                  value={editVisitForm.therapistName}
                  onChange={(v) => { setEditVisitForm((f) => ({ ...f, therapistName: v })); setEditVisitError('') }}
                />

                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-600">
                    {t('visit.technique')}<span className="text-red-500 ml-0.5">*</span>
                  </label>
                  <select
                    value={editVisitForm.therapistServiceTechnique}
                    onChange={(e) => { setEditVisitForm((f) => ({ ...f, therapistServiceTechnique: e.target.value })); setEditVisitError('') }}
                    className={`px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0F766E] bg-white ${
                      editVisitForm.therapistServiceTechnique ? 'text-gray-900' : 'text-gray-400'
                    }`}
                  >
                    <option value="">{t('therapist.techniquePlaceholder')}</option>
                    {TECHNIQUE_CATEGORIES.map((cat) => (
                      <optgroup key={cat} label={cat}>
                        {SERVICE_MENU_ITEMS.filter((item) => item.category === cat).map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-600">
                    {t('visit.bodyParts')}<span className="text-red-500 ml-0.5">*</span>
                  </label>
                  {editVisitMeta.unrecognized.length > 0 && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
                      <span className="font-medium">{t('visit.originalNotes')}:</span>{' '}
                      <span className="font-mono">{editVisitMeta.rawBodyParts}</span>
                      <br />
                      <span className="text-amber-600">{t('visit.originalNotesHint')}</span>
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {BODY_PARTS_OPTIONS.map((cat) => {
                      const selected = editVisitForm.bodyParts.includes(cat)
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => {
                            setEditVisitForm((f) => ({
                              ...f,
                              bodyParts: selected
                                ? f.bodyParts.filter((c) => c !== cat)
                                : [...f.bodyParts, cat],
                            }))
                            setEditVisitError('')
                          }}
                          className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                            selected
                              ? 'bg-[#0F766E] text-white border-[#0F766E]'
                              : 'bg-white text-gray-700 border-gray-200 active:bg-gray-100'
                          }`}
                        >
                          {cat}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <EditField
                    label={t('profile.adminPin')}
                    required
                    type="password"
                    value={editVisitPin}
                    onChange={(v) => { setEditVisitPin(v); setEditVisitError('') }}
                  />
                </div>

                {editVisitError && <p className="text-red-500 text-sm">{editVisitError}</p>}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => { setEditVisitId(null); setEditVisitPin(''); setEditVisitError('') }}
                    className="flex-1 py-2.5 border border-gray-200 rounded-lg text-gray-700 font-medium text-sm"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={() => {
                      const f = editVisitForm
                      if (!f.therapistName.trim() || !f.therapistServiceTechnique.trim() || f.bodyParts.length === 0 || !editVisitPin) {
                        setEditVisitError(t('profile.fieldRequired'))
                        return
                      }
                      editVisitMutation.mutate({
                        visitId: editVisitId,
                        therapistName: f.therapistName,
                        therapistServiceTechnique: f.therapistServiceTechnique,
                        therapistBodyPartsNotes: f.bodyParts.join(', '),
                        pin: editVisitPin,
                      })
                    }}
                    disabled={editVisitMutation.isPending}
                    className="flex-1 py-2.5 bg-[#0F766E] text-white rounded-lg font-medium text-sm disabled:opacity-50"
                  >
                    {editVisitMutation.isPending ? t('common.saving') : t('common.save')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Card 2: Staff Notes */}
          <div className="bg-[#FAFAFA] border border-gray-200 rounded-xl p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#0D0D0D]">
                {t('profile.staffNotes')}
              </h3>
              {!editingNotes && (
                <button
                  onClick={() => {
                    setNotesValue(customer.staffNotes ?? '')
                    setEditingNotes(true)
                  }}
                  className="flex items-center gap-1 px-2 py-1 border border-gray-200 rounded-md hover:bg-gray-100 transition-colors"
                >
                  {/* pencil icon */}
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#374151"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  <span className="text-xs text-gray-700">{t('common.edit')}</span>
                </button>
              )}
            </div>

            {editingNotes ? (
              <div className="flex flex-col gap-2">
                <textarea
                  value={notesValue}
                  onChange={(e) => setNotesValue(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0F766E] resize-none"
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setEditingNotes(false)}
                    className="px-3 py-1.5 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={() => notesMutation.mutate(notesValue)}
                    disabled={notesMutation.isPending}
                    className="px-3 py-1.5 bg-[#0F766E] text-white text-sm font-medium rounded-lg hover:bg-[#0d6b63] disabled:opacity-50"
                  >
                    {notesMutation.isPending
                      ? t('common.saving')
                      : t('common.save')}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">
                {customer.staffNotes || t('profile.noNotes')}
              </p>
            )}
          </div>

          {/* Card 3: Form Status */}
          {intakeForm && (
            <div className="bg-[#FAFAFA] border border-gray-200 rounded-xl p-4 flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-[#0D0D0D]">
                {t('admin.formStatus')}
              </h3>
              <div className="flex flex-col gap-1.5">
                <DetailRow
                  label={t('visit.status')}
                  value={null}
                  badge={formStatusBadge}
                />
                <DetailRow
                  label={t('admin.firstSigned')}
                  value={formatLocalTime(intakeForm.clientSignedAt)}
                />
                <DetailRow
                  label={t('admin.lastReviewed')}
                  value={formatLocalTime(intakeForm.lastReviewedAt)}
                />
                <DetailRow
                  label={t('msg.totalVisits')}
                  value={String(visits.length)}
                />
              </div>
            </div>
          )}
        </div>

        {/* Right column — fill */}
        <div className="flex-1 min-w-0 flex flex-col gap-6">
          {/* Health Summary */}
          <div className="bg-[#FAFAFA] border border-gray-200 rounded-xl p-4 flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-[#0D0D0D]">
              {t('msg.healthSummary')}
            </h3>

            {!formData ? (
              <p className="text-xs text-gray-400">
                {t('admin.noIntakeForm')}
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {/* Green positive badges */}
                {noConditions && (
                  <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-[#D1FAE5] text-[#16A34A]">
                    {t('health.noConditions')}
                  </span>
                )}
                {positiveBadges.map((b) => (
                  <span
                    key={b.key}
                    className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-[#D1FAE5] text-[#16A34A]"
                  >
                    {b.label}
                  </span>
                ))}

                {/* Yellow warning badges */}
                {warningBadges.map((b) => (
                  <span
                    key={b.key}
                    className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-[#FEF3C7] text-[#92400E]"
                  >
                    {b.label}
                  </span>
                ))}

                {/* Non-high-risk info badges */}
                {infoBadges.map((b) => (
                  <span
                    key={b.key}
                    className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-[#FEF3C7] text-[#92400E]"
                  >
                    {b.label}
                  </span>
                ))}

                {/* Red avoid badges */}
                {avoidBadges.map((b) => (
                  <span
                    key={b.key}
                    className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-[#FEE2E2] text-[#DC2626]"
                  >
                    {b.label}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Visit History */}
          <div className="bg-[#FAFAFA] border border-gray-200 rounded-xl p-4 flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-[#0D0D0D]">
              {t('profile.visitHistory')}
            </h3>
            <VisitHistory
              visits={visitRecords}
              showLocation
              onEdit={(v) => {
                const rawParts = (v.therapistBodyPartsNotes ?? '')
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
                const recognized = rawParts.filter((p) =>
                  (BODY_PARTS_OPTIONS as readonly string[]).includes(p),
                )
                const unrecognized = rawParts.filter((p) =>
                  !(BODY_PARTS_OPTIONS as readonly string[]).includes(p),
                )
                setEditVisitId(v.id)
                setEditVisitForm({
                  therapistName: v.therapistName ?? '',
                  therapistServiceTechnique: v.therapistServiceTechnique ?? '',
                  bodyParts: recognized,
                })
                setEditVisitMeta({
                  date: formatLocalTime(v.visitDate),
                  rawBodyParts: v.therapistBodyPartsNotes ?? '',
                  unrecognized,
                })
                setEditVisitPin('')
                setEditVisitError('')
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function DetailRow({
  label,
  value,
  badge,
}: {
  label: string
  value: string | null | undefined
  badge?: { bg: string; color: string; label: string } | null
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-[#9CA3AF]">{label}</span>
      {badge ? (
        <span
          className="px-2.5 py-0.5 text-xs font-medium rounded-full"
          style={{ backgroundColor: badge.bg, color: badge.color }}
        >
          {badge.label}
        </span>
      ) : (
        <span className="text-xs text-[#374151]">{value ?? '-'}</span>
      )}
    </div>
  )
}

function EditField({
  label,
  value,
  onChange,
  required,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  required?: boolean
  type?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-600">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
      />
    </div>
  )
}
