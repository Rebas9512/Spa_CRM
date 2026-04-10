import { useQuery } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/apiClient'
import { useTranslation } from '../i18n'

interface PendingVisit {
  id: string
  customerId: string
  customerName: string
  visitDate: string
  serviceType: string
  therapistName: string
}

interface PendingTherapistResponse {
  visits: PendingVisit[]
}

export default function PendingSignatureBanner() {
  const { storeId } = useParams<{ storeId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const { data } = useQuery({
    queryKey: ['pending-therapist', storeId],
    queryFn: () =>
      apiFetch<PendingTherapistResponse>(
        `/api/stores/${storeId}/visits/pending-therapist`,
      ),
    refetchInterval: 30000,
    enabled: !!storeId,
  })

  const count = data?.visits?.length ?? 0
  if (count === 0) return null

  return (
    <div className="bg-[#0F766E] text-white px-4 py-3 flex items-center justify-between rounded-lg">
      <span className="text-sm font-medium">
        {t('banner.pendingSignatures').replace('{count}', String(count))}
      </span>
      <button
        onClick={() => navigate(`/s/${storeId}/therapist-queue`)}
        className="bg-white text-[#0F766E] px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
      >
        {t('banner.signNow')}
      </button>
    </div>
  )
}
