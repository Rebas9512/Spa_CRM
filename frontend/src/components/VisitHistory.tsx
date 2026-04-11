import { useState } from 'react'
import { useTranslation } from '../i18n'
import { formatLocalTime } from '../lib/timezone'

export interface VisitRecord {
  id: string
  visitDate: string
  serviceType: string | null
  therapistServiceTechnique: string | null
  therapistName: string | null
  therapistSignedAt: string | null
  pointsRedeemed?: number
  pointsAfter?: number | null
  cancelledAt: string | null
  storeName?: string | null
}

/** Normalize technique text: uppercase, remove punctuation, keep letters/digits/CJK */
export function normalizeTechnique(raw: string | null | undefined): string {
  if (!raw) return '-'
  return raw.replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim().toUpperCase() || '-'
}

interface VisitHistoryProps {
  visits: VisitRecord[]
  onCancel?: (visitId: string) => void
  showLocation?: boolean
}

function getStatus(v: VisitRecord): 'active' | 'completed' | 'cancelled' {
  if (v.cancelledAt) return 'cancelled'
  if (v.therapistSignedAt) return 'completed'
  return 'active'
}

const statusConfig = {
  active: { bg: '#DBEAFE', text: '#1E40AF', label: 'visit.statusActive' },
  completed: { bg: '#D1FAE5', text: '#065F46', label: 'visit.statusCompleted' },
  cancelled: { bg: '#FEE2E2', text: '#991B1B', label: 'visit.statusCancelled' },
} as const

export default function VisitHistory({ visits, onCancel, showLocation }: VisitHistoryProps) {
  const { t } = useTranslation()
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const handleCancelClick = (visitId: string) => {
    if (confirmingId === visitId) {
      onCancel?.(visitId)
      setConfirmingId(null)
    } else {
      setConfirmingId(visitId)
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="py-2 px-3 text-xs font-medium text-gray-500 uppercase">
              {t('visit.date')}
            </th>
            <th className="py-2 px-3 text-xs font-medium text-gray-500 uppercase">
              {t('visit.service')}
            </th>
            <th className="py-2 px-3 text-xs font-medium text-gray-500 uppercase">
              {t('visit.therapist')}
            </th>
            {showLocation && (
              <th className="py-2 px-3 text-xs font-medium text-gray-500 uppercase">
                {t('visit.location')}
              </th>
            )}
            <th className="py-2 px-3 text-xs font-medium text-gray-500 uppercase">
              {t('visit.pointsRedeemed')}
            </th>
            <th className="py-2 px-3 text-xs font-medium text-gray-500 uppercase">
              {t('visit.pointsAfter')}
            </th>
            <th className="py-2 px-3 text-xs font-medium text-gray-500 uppercase">
              {t('visit.status')}
            </th>
            <th className="py-2 px-3 text-xs font-medium text-gray-500 uppercase">
              {t('visit.action')}
            </th>
          </tr>
        </thead>
        <tbody>
          {visits.map((v) => {
            const status = getStatus(v)
            const cfg = statusConfig[status]
            const canCancel =
              status === 'active' && !v.therapistSignedAt && onCancel

            return (
              <tr key={v.id} className="border-b border-gray-100">
                <td className="py-2.5 px-3 text-sm text-gray-900">
                  {formatLocalTime(v.visitDate)}
                </td>
                <td className="py-2.5 px-3 text-sm text-gray-600">
                  {v.cancelledAt ? '-' : normalizeTechnique(v.therapistServiceTechnique)}
                </td>
                <td className="py-2.5 px-3 text-sm text-gray-600">
                  {v.therapistName ?? '-'}
                </td>
                {showLocation && (
                  <td className="py-2.5 px-3 text-sm text-gray-600">
                    {v.storeName ?? '-'}
                  </td>
                )}
                <td className="py-2.5 px-3 text-sm text-gray-600">
                  {status === 'completed'
                    ? (v.pointsRedeemed && v.pointsRedeemed > 0
                        ? <span className="text-amber-600 font-medium">{t('common.yes')}</span>
                        : t('common.no'))
                    : '-'}
                </td>
                <td className="py-2.5 px-3 text-sm text-gray-600">
                  {status === 'completed' && v.pointsAfter != null ? v.pointsAfter : '-'}
                </td>
                <td className="py-2.5 px-3">
                  <span
                    className="px-2 py-0.5 text-xs font-medium rounded-full"
                    style={{ backgroundColor: cfg.bg, color: cfg.text }}
                  >
                    {t(cfg.label)}
                  </span>
                </td>
                <td className="py-2.5 px-3">
                  {canCancel && (
                    <button
                      onClick={() => handleCancelClick(v.id)}
                      className="text-red-600 text-sm font-medium hover:underline"
                    >
                      {confirmingId === v.id
                        ? t('visit.confirmCancel')
                        : t('visit.cancelVisit')}
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
          {visits.length === 0 && (
            <tr>
              <td
                colSpan={showLocation ? 8 : 7}
                className="py-6 text-center text-gray-400 text-sm"
              >
                {t('visit.noHistory')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
