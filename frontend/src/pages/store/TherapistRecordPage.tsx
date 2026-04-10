import { useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../../lib/apiClient'
import { useTranslation } from '../../i18n'
import HealthAlertBadge, {
  type HealthAlerts,
} from '../../components/HealthAlertBadge'

interface VisitDetail {
  id: string
  customerName: string
  serviceType: string | null
  visitDate: string
  healthAlerts: HealthAlerts
  areasToAvoid: string
  nextPendingVisitId: string | null
}

export default function TherapistRecordPage() {
  const { storeId, id } = useParams<{
    storeId: string
    id: string
  }>()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { t } = useTranslation()

  const queueState = (location.state as { index?: number; total?: number }) ?? {}
  const queueIndex = queueState.index ?? 1
  const queueTotal = queueState.total ?? 1

  const [therapistName, setTherapistName] = useState('')
  const [technique, setTechnique] = useState('')
  const [bodyParts, setBodyParts] = useState('')
  const [validationError, setValidationError] = useState('')

  const { data: visit, isError } = useQuery({
    queryKey: ['visit-detail', id],
    queryFn: async () => {
      const res = await apiFetch<{ visit: VisitDetail }>(`/api/visits/${id}`)
      return res.visit
    },
    enabled: !!id,
  })

  const signMutation = useMutation({
    mutationFn: async () => {
      return apiFetch<{ therapistSignedAt: string; nextPendingVisitId: string | null }>(
        `/api/visits/${id}/therapist`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            therapistName: therapistName.trim(),
            therapistServiceTechnique: technique,
            therapistBodyPartsNotes: bodyParts,
          }),
        },
      )
    },
    onSuccess: (data) => {
      // Invalidate queue cache so it refetches fresh data
      queryClient.invalidateQueries({ queryKey: ['pending-therapist-list'] })
      queryClient.invalidateQueries({ queryKey: ['pending-therapist'] })
      if (data.nextPendingVisitId) {
        navigate(
          `/s/${storeId}/visits/${data.nextPendingVisitId}/therapist`,
          {
            state: { index: queueIndex + 1, total: queueTotal },
          },
        )
      } else {
        navigate(`/s/${storeId}/therapist-queue`)
      }
    },
  })

  const handleSubmit = () => {
    if (!therapistName.trim() || !technique.trim() || !bodyParts.trim()) {
      setValidationError(t('therapist.allFieldsRequired'))
      return
    }
    setValidationError('')
    signMutation.mutate()
  }

  const isLast = !visit?.nextPendingVisitId

  if (isError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-gray-500">{t('common.loadFailed')}</p>
          <button
            onClick={() => navigate(`/s/${storeId}/therapist-queue`)}
            className="text-[#0F766E] font-medium text-sm hover:underline"
          >
            &larr; {t('nav.back')}
          </button>
        </div>
      </div>
    )
  }

  if (!visit) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <span className="text-gray-400">{t('common.loading')}</span>
      </div>
    )
  }

  // Check if any health alerts are active
  const hasAlerts =
    visit.healthAlerts &&
    Object.values(visit.healthAlerts).some((v) => v === true)

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-['Inter',sans-serif]">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => navigate(`/s/${storeId}/therapist-queue`)}
          className="text-[#0F766E] font-medium text-sm hover:underline"
        >
          &larr; {t('queue.title')} ({queueIndex}/{queueTotal})
        </button>
      </header>

      <div className="flex-1 px-6 py-6 max-w-2xl mx-auto w-full flex flex-col gap-5">
        {/* Client Info */}
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center gap-4">
          <span className="font-semibold text-gray-900">
            {visit.customerName}
          </span>
          <span className="text-gray-400">&middot;</span>
          <span className="text-sm text-gray-600">
            {visit.serviceType ?? '-'}
          </span>
          <span className="text-gray-400">&middot;</span>
          <span className="text-sm text-gray-500">{visit.visitDate}</span>
        </div>

        {/* Health Alert Bar */}
        {hasAlerts && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-amber-600 font-medium text-sm">
                {t('therapist.healthAlerts')}
              </span>
            </div>
            <HealthAlertBadge healthAlerts={visit.healthAlerts} />
            {visit.areasToAvoid && (
              <p className="text-sm text-amber-700 mt-1">
                {t('therapist.areasToAvoid')}: {visit.areasToAvoid}
              </p>
            )}
          </div>
        )}

        {/* Therapist Name */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">
            {t('newClient.therapistName')}
          </label>
          <input
            type="text"
            value={therapistName}
            onChange={(e) => setTherapistName(e.target.value)}
            placeholder={t('newClient.therapistPlaceholder')}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
          />
        </div>

        {/* Technique */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">
            {t('therapist.technique')}
          </label>
          <input
            type="text"
            value={technique}
            onChange={(e) => setTechnique(e.target.value)}
            placeholder={t('therapist.techniquePlaceholder')}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
          />
        </div>

        {/* Body Parts */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">
            {t('therapist.bodyParts')}
          </label>
          <input
            type="text"
            value={bodyParts}
            onChange={(e) => setBodyParts(e.target.value)}
            placeholder={t('therapist.bodyPartsPlaceholder')}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
          />
        </div>

        {/* Validation error */}
        {validationError && (
          <p className="text-red-500 text-sm">{validationError}</p>
        )}
        {signMutation.isError && (
          <p className="text-red-500 text-sm">{t('common.saveFailed')}</p>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={signMutation.isPending}
          className="w-full py-3 bg-[#0F766E] text-white font-medium rounded-lg active:bg-[#0d6b63] disabled:opacity-50 transition-colors mt-2"
        >
          {signMutation.isPending
            ? t('common.saving')
            : isLast
              ? t('therapist.signAndDone')
              : t('therapist.signAndNext')}
        </button>
      </div>
    </div>
  )
}
