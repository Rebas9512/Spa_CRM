import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MASSAGE_TYPES } from '@spa-crm/shared'
import { apiFetch } from '../../lib/apiClient'
import { formatLocalTime } from '../../lib/timezone'
import { useAppStore } from '../../store/appStore'
import { useTranslation } from '../../i18n'
import HealthAlertBadge, {
  type HealthAlerts,
} from '../../components/HealthAlertBadge'

interface CustomerDetail {
  id: string
  firstName: string
  lastName: string
  lastVisit: string | null
  totalVisits: number
  healthAlerts: HealthAlerts
  areasToAvoid: string
  intakeFormId: string | null
  loyaltyPoints: number
}

export default function ReturnCheckin() {
  const { storeId, id } = useParams<{
    storeId: string
    id: string
  }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { setAccessLevel } = useAppStore()
  const { t } = useTranslation()

  const [serviceType, setServiceType] = useState<string>(MASSAGE_TYPES[0].value)
  const [therapistName, setTherapistName] = useState('')

  const { data: customer, isLoading, isError } = useQuery({
    queryKey: ['customer-detail', id],
    queryFn: async () => {
      const res = await apiFetch<{ customer: CustomerDetail }>(`/api/customers/${id}`)
      return res.customer
    },
    enabled: !!id,
  })

  const checkinMutation = useMutation({
    mutationFn: async () => {
      // Review intake form (refresh last_reviewed_at)
      await apiFetch(
        `/api/customers/${id}/intake/review`,
        { method: 'PATCH' },
      )
      // Create visit
      await apiFetch(`/api/customers/${id}/visits`, {
        method: 'POST',
        body: JSON.stringify({
          serviceType,
          therapistName,
        }),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-therapist-list'] })
      queryClient.invalidateQueries({ queryKey: ['pending-therapist'] })
      navigate(`/s/${storeId}/`)
    },
  })

  const handleUpdateHealth = () => {
    setAccessLevel('customer')
    navigate(`/s/${storeId}/intake/${id}/edit`)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <span className="text-gray-400">{t('common.loading')}</span>
      </div>
    )
  }

  if (isError || !customer) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-gray-500">{t('common.loadFailed')}</p>
          <button onClick={() => navigate(`/s/${storeId}/`)} className="text-[#0F766E] font-medium text-sm">
            &larr; {t('nav.back')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-['Inter',sans-serif]">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3">
        <button
          onClick={() => navigate(`/s/${storeId}/`)}
          className="text-[#0F766E] font-medium text-sm active:opacity-70 transition-opacity flex items-center gap-1"
        >
          &larr; {t('nav.back')}
        </button>
      </header>

      <div className="flex-1 px-6 py-6 max-w-2xl mx-auto w-full flex flex-col gap-6">
        {/* Customer name + points */}
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{customer.firstName} {customer.lastName}</h1>
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-sm font-semibold">
              ★ {customer.loyaltyPoints} {t('profile.loyaltyPoints')}
            </span>
          </div>
          <div className="flex gap-6 text-sm text-gray-500 mt-2">
            <span>
              {t('checkin.lastVisit')}: {formatLocalTime(customer.lastVisit) || t('customer.noVisits')}
            </span>
            <span>
              {t('checkin.totalVisits')}: {customer.totalVisits}
            </span>
          </div>
        </div>

        {/* Health Summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3">
          <h3 className="text-sm font-bold text-gray-900">
            {t('checkin.healthSummary')}
          </h3>
          <HealthAlertBadge healthAlerts={customer.healthAlerts} />
          {customer.areasToAvoid && (
            <p className="text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
              {t('checkin.areasToAvoid')}: {customer.areasToAvoid}
            </p>
          )}
          <button
            onClick={() => navigate(`/s/${storeId}/customer/${id}`)}
            className="text-[#0F766E] text-sm font-medium hover:underline self-start"
          >
            {t('checkin.viewProfile')} &rarr;
          </button>
        </div>

        {/* Service Type */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">
            {t('checkin.serviceType')}
          </label>
          <select
            value={serviceType}
            onChange={(e) => setServiceType(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
          >
            {MASSAGE_TYPES.map((mt) => (
              <option key={mt.value} value={mt.value}>
                {mt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Therapist */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">
            {t('checkin.therapist')}
          </label>
          <input
            type="text"
            value={therapistName}
            onChange={(e) => setTherapistName(e.target.value)}
            placeholder={t('checkin.therapistPlaceholder')}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
          />
        </div>

        {checkinMutation.isError && (
          <p className="text-red-500 text-sm">
            {t('common.saveFailed')}
          </p>
        )}

        {/* Actions */}
        <div className="grid grid-cols-2 gap-4 mt-2">
          <button
            onClick={() => checkinMutation.mutate()}
            disabled={checkinMutation.isPending}
            className="w-full py-3 bg-[#0F766E] text-white font-medium rounded-lg active:bg-[#0d6b63] disabled:opacity-50 transition-colors"
          >
            {checkinMutation.isPending
              ? t('common.saving')
              : t('checkin.confirmCheckIn')}
          </button>
          <button
            onClick={handleUpdateHealth}
            className="w-full py-3 border-2 border-[#0F766E] text-[#0F766E] font-medium rounded-lg active:bg-[#0F766E]/5 transition-colors"
          >
            {t('checkin.updateHealthForm')} &rarr;
          </button>
        </div>

        {/* Disclaimer */}
        <p className="text-xs text-gray-400 text-center leading-relaxed">
          {t('checkin.disclaimer')}
        </p>
      </div>
    </div>
  )
}
