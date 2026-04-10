import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../lib/apiClient'
import { useTranslation } from '../../i18n'

interface PendingVisit {
  id: string
  customerName: string
  serviceType: string | null
  visitDate: string
}

export default function TherapistQueuePage() {
  const { storeId } = useParams<{ storeId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const { data: pendingVisits = [] } = useQuery({
    queryKey: ['pending-therapist-list', storeId],
    queryFn: async () => {
      const res = await apiFetch<{ visits: Array<{
        id: string; customerName: string; serviceType: string | null; visitDate: string
      }> }>(`/api/stores/${storeId}/visits/pending-therapist`)
      return res.visits
    },
    enabled: !!storeId,
    refetchInterval: 15000,
  })

  const total = pendingVisits.length

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-['Inter',sans-serif]">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 relative flex items-center">
        <button
          onClick={() => navigate(`/s/${storeId}/`)}
          className="text-[#0F766E] font-medium text-sm hover:underline"
        >
          &larr; {t('nav.back')}
        </button>
        <h1 className="text-lg font-bold text-gray-900 absolute left-1/2 -translate-x-1/2">
          {t('header.pendingSignatures')}
        </h1>
      </header>

      <div className="flex-1 px-6 py-6 max-w-2xl mx-auto w-full">
        {total === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <span className="text-green-600 text-3xl">&#x2713;</span>
            </div>
            <p className="text-lg font-medium text-gray-700">
              {t('queue.allClear')}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {pendingVisits.map((visit, index) => (
              <div
                key={visit.id}
                className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-400 font-medium">
                    {index + 1}/{total}
                  </span>
                  <span className="font-semibold text-gray-900">
                    {visit.customerName}
                  </span>
                  <span className="text-gray-400">&middot;</span>
                  <span className="text-sm text-gray-600">
                    {visit.serviceType ?? '-'}
                  </span>
                  <span className="text-gray-400">&middot;</span>
                  <span className="text-sm text-gray-500">
                    {visit.visitDate}
                  </span>
                </div>
                <button
                  onClick={() =>
                    navigate(`/s/${storeId}/visits/${visit.id}/therapist`, {
                      state: { index: index + 1, total },
                    })
                  }
                  className="px-4 py-2 bg-[#0F766E] text-white font-medium rounded-lg active:bg-[#0d6b63] transition-colors text-sm"
                >
                  {t('queue.sign')} &rarr;
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
