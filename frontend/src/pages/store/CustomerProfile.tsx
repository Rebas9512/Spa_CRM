import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../../lib/apiClient'
import { useTranslation } from '../../i18n'
import HealthAlertBadge, {
  type HealthAlerts,
} from '../../components/HealthAlertBadge'
import VisitHistory, { type VisitRecord } from '../../components/VisitHistory'

interface CustomerProfileData {
  id: string
  firstName: string
  lastName: string
  phone: string
  email: string | null
  address: string | null
  dateOfBirth: string | null
  staffNotes: string
  loyaltyPoints: number
  loyaltyImportedAt: string | null
  healthAlerts: HealthAlerts
  visits: VisitRecord[]
}

export default function CustomerProfile() {
  const { storeId, id } = useParams<{
    storeId: string
    id: string
  }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useTranslation()

  const [editingNotes, setEditingNotes] = useState(false)
  const [notesValue, setNotesValue] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [importValue, setImportValue] = useState('')
  const [importError, setImportError] = useState('')

  const { data: customer, isLoading, isError } = useQuery({
    queryKey: ['customer-profile', id],
    queryFn: async () => {
      const res = await apiFetch<{ customer: CustomerProfileData }>(`/api/customers/${id}`)
      return res.customer
    },
    enabled: !!id,
  })

  const notesMutation = useMutation({
    mutationFn: (notes: string) =>
      apiFetch(`/api/customers/${id}/notes`, {
        method: 'PATCH',
        body: JSON.stringify({ staffNotes: notes }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['customer-profile', id],
      })
      setEditingNotes(false)
    },
  })

  const cancelVisitMutation = useMutation({
    mutationFn: (visitId: string) =>
      apiFetch(`/api/visits/${visitId}/cancel`, { method: 'PATCH' }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['customer-profile', id],
      })
    },
  })

  const importMutation = useMutation({
    mutationFn: (points: number) =>
      apiFetch(`/api/customers/${id}/import-points`, {
        method: 'POST',
        body: JSON.stringify({ points }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-profile', id] })
      setShowImport(false)
      setImportValue('')
      setImportError('')
    },
    onError: () => {
      setImportError(t('profile.alreadyImported'))
    },
  })

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
          <button onClick={() => navigate(-1)} className="text-[#0F766E] font-medium text-sm">
            &larr; {t('nav.back')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-['Inter',sans-serif]">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="text-[#0F766E] font-medium text-sm hover:underline"
        >
          &larr; {t('nav.back')}
        </button>
        <h1 className="text-xl font-bold text-gray-900">
          {customer.firstName} {customer.lastName}
        </h1>
      </header>

      <div className="flex-1 px-6 py-6 max-w-3xl mx-auto w-full flex flex-col gap-6">
        {/* Demographics */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3">
          <h3 className="text-sm font-medium text-gray-500 uppercase">
            {t('profile.demographics')}
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-xs text-gray-400">{t('profile.name')}</span>
              <p className="text-gray-900">
                {customer.firstName} {customer.lastName}
              </p>
            </div>
            <div>
              <span className="text-xs text-gray-400">{t('profile.phone')}</span>
              <p className="text-gray-900">{customer.phone}</p>
            </div>
            <div>
              <span className="text-xs text-gray-400">{t('profile.email')}</span>
              <p className="text-gray-900">{customer.email ?? '-'}</p>
            </div>
            <div>
              <span className="text-xs text-gray-400">
                {t('profile.address')}
              </span>
              <p className="text-gray-900">{customer.address ?? '-'}</p>
            </div>
            <div>
              <span className="text-xs text-gray-400">{t('profile.dob')}</span>
              <p className="text-gray-900">{customer.dateOfBirth ?? '-'}</p>
            </div>
            <div>
              <span className="text-xs text-gray-400">{t('profile.loyaltyPoints')}</span>
              <div className="flex items-center gap-2">
                <p className={`font-medium ${customer.loyaltyPoints >= 10 ? 'text-amber-600' : 'text-gray-900'}`}>
                  {customer.loyaltyPoints}
                </p>
                {!customer.loyaltyImportedAt && !showImport && (
                  <button
                    onClick={() => setShowImport(true)}
                    className="text-xs text-[#0F766E] font-medium hover:underline"
                  >
                    {t('profile.importPoints')}
                  </button>
                )}
              </div>
            </div>
          </div>
          {showImport && (
            <div className="mt-3 p-3 bg-gray-50 rounded-lg flex flex-col gap-2">
              <p className="text-xs text-gray-500">{t('profile.importPointsDesc')}</p>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={importValue}
                  onChange={(e) => { setImportValue(e.target.value); setImportError('') }}
                  placeholder={t('profile.importPointsPlaceholder')}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                />
                <button
                  onClick={() => {
                    const pts = parseInt(importValue, 10)
                    if (!pts || pts < 1) return
                    importMutation.mutate(pts)
                  }}
                  disabled={importMutation.isPending}
                  className="px-3 py-2 bg-[#0F766E] text-white text-sm font-medium rounded-lg disabled:opacity-50"
                >
                  {importMutation.isPending ? t('common.saving') : t('common.save')}
                </button>
                <button
                  onClick={() => { setShowImport(false); setImportValue(''); setImportError('') }}
                  className="px-3 py-2 text-gray-600 text-sm font-medium"
                >
                  {t('common.cancel')}
                </button>
              </div>
              {importError && <p className="text-red-500 text-xs">{importError}</p>}
            </div>
          )}
        </div>

        {/* Health Badges */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3">
          <h3 className="text-sm font-medium text-gray-500 uppercase">
            {t('profile.healthConditions')}
          </h3>
          <HealthAlertBadge healthAlerts={customer.healthAlerts} />
        </div>

        {/* Staff Notes */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-500 uppercase">
              {t('profile.staffNotes')}
            </h3>
            {!editingNotes && (
              <button
                onClick={() => {
                  setNotesValue(customer.staffNotes)
                  setEditingNotes(true)
                }}
                className="text-[#0F766E] text-sm font-medium hover:underline"
              >
                {t('common.edit')}
              </button>
            )}
          </div>
          {editingNotes ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={notesValue}
                onChange={(e) => setNotesValue(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0F766E] resize-none"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setEditingNotes(false)}
                  className="px-3 py-1.5 text-gray-600 text-sm font-medium rounded-lg active:bg-gray-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={() => notesMutation.mutate(notesValue)}
                  disabled={notesMutation.isPending}
                  className="px-3 py-1.5 bg-[#0F766E] text-white text-sm font-medium rounded-lg active:bg-[#0d6b63] disabled:opacity-50"
                >
                  {notesMutation.isPending
                    ? t('common.saving')
                    : t('common.save')}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-gray-700 text-sm whitespace-pre-wrap">
              {customer.staffNotes || t('profile.noNotes')}
            </p>
          )}
        </div>

        {/* Visit History */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3">
          <h3 className="text-sm font-medium text-gray-500 uppercase">
            {t('profile.visitHistory')}
          </h3>
          <VisitHistory
            visits={customer.visits}
            onCancel={(id) => cancelVisitMutation.mutate(id)}
          />
        </div>
      </div>
    </div>
  )
}
