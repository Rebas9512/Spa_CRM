import { useTranslation } from '../i18n'
import { formatLocalTime } from '../lib/timezone'

export interface CustomerSummary {
  id: string
  name: string
  phone: string
  lastVisit: string | null
  totalVisits: number
  healthStatus: 'ok' | 'alert'
}

interface CustomerCardProps {
  customer: CustomerSummary
  variant: 'search' | 'row'
  onCheckIn?: () => void
  onClick?: () => void
}

export default function CustomerCard({
  customer,
  variant,
  onCheckIn,
  onClick,
}: CustomerCardProps) {
  const { t } = useTranslation()

  const healthBadge =
    customer.healthStatus === 'ok' ? (
      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">
        OK
      </span>
    ) : (
      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700">
        {t('health.alert')}
      </span>
    )

  if (variant === 'search') {
    return (
      <div className="bg-[#F0FDF4] border border-green-200 rounded-xl p-4 flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900">{customer.name}</span>
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-200 text-green-800">
              {t('customer.found')}
            </span>
            {healthBadge}
          </div>
          <span className="text-sm text-gray-500">
            {customer.phone} &middot;{' '}
            {t('customer.visits').replace('{count}', String(customer.totalVisits))}
          </span>
        </div>
        {onCheckIn && (
          <button
            onClick={onCheckIn}
            className="px-4 py-2 bg-[#0F766E] text-white font-medium rounded-lg hover:bg-[#0d6b63] transition-colors text-sm"
          >
            {t('customer.checkIn')}
          </button>
        )}
      </div>
    )
  }

  // variant === 'row'
  return (
    <tr
      onClick={onClick}
      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
    >
      <td className="py-3 px-4 font-medium text-gray-900">{customer.name}</td>
      <td className="py-3 px-4 text-gray-600">{customer.phone}</td>
      <td className="py-3 px-4 text-gray-600">
        {formatLocalTime(customer.lastVisit) === '-' ? t('customer.noVisits') : formatLocalTime(customer.lastVisit)}
      </td>
      <td className="py-3 px-4 text-gray-600 text-center">{customer.totalVisits}</td>
      <td className="py-3 px-4">{healthBadge}</td>
      <td className="py-3 px-4">
        {onCheckIn && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onCheckIn()
            }}
            className="text-[#0F766E] font-medium text-sm hover:underline"
          >
            {t('customer.checkIn')}
          </button>
        )}
      </td>
    </tr>
  )
}
