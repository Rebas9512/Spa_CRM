import { useTranslation } from '../i18n'

interface StoreBreakdown {
  storeName: string
  count: number
}

interface TopCustomer {
  id: string
  name: string
  phone: string
  visitCount: number
  foot: number
  body: number
  combo: number
  chair: number
  head: number
  storeBreakdown?: StoreBreakdown[]
}

type ViewMode = 'service' | 'store'

const SERVICE_COLORS = {
  foot: '#0F766E',
  body: '#F59E0B',
  combo: '#6366F1',
  chair: '#EC4899',
  head: '#06B6D4',
  other: '#D1D5DB',
} as const

const STORE_COLORS = ['#0F766E', '#F59E0B', '#6366F1', '#EF4444', '#EC4899', '#8B5CF6']

export default function TopCustomers({ customers, mode = 'service' }: { customers: TopCustomer[]; mode?: ViewMode }) {
  const { t } = useTranslation()

  if (customers.length === 0) {
    return <div className="text-center text-gray-400 py-6">No data</div>
  }

  // Stable color assignment based on store name hash (consistent across renders)
  function storeNameHash(name: string): number {
    let h = 0
    for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0
    return Math.abs(h)
  }
  const allStoreNames = [...new Set(customers.flatMap((c) => (c.storeBreakdown ?? []).map((s) => s.storeName)))]
  const storeColorMap = new Map(allStoreNames.map((name) => [name, STORE_COLORS[storeNameHash(name) % STORE_COLORS.length]]))

  const maxCount = Math.max(...customers.map((c) => c.visitCount), 1)

  return (
    <div className="space-y-4">
      {customers.map((cust, i) => {
        const barWidth = (cust.visitCount / maxCount) * 100

        // Service segments
        const head = cust.head ?? 0
        const serviceOther = cust.visitCount - cust.foot - cust.body - cust.combo - cust.chair - head
        const serviceSegments = [
          { key: 'F', value: cust.foot, color: SERVICE_COLORS.foot },
          { key: 'B', value: cust.body, color: SERVICE_COLORS.body },
          { key: 'C', value: cust.combo, color: SERVICE_COLORS.combo },
          { key: 'A', value: cust.chair, color: SERVICE_COLORS.chair },
          { key: 'H', value: head, color: SERVICE_COLORS.head },
          ...(serviceOther > 0 ? [{ key: '?', value: serviceOther, color: SERVICE_COLORS.other }] : []),
        ].filter((s) => s.value > 0)

        // Store segments
        const storeSegments = (cust.storeBreakdown ?? []).map((s) => ({
          key: s.storeName, value: s.count, color: storeColorMap.get(s.storeName) ?? '#D1D5DB',
        }))

        const segments = mode === 'store' && storeSegments.length > 0 ? storeSegments : serviceSegments
        const labels = mode === 'store' && storeSegments.length > 0
          ? storeSegments.map((s) => ({ label: s.key, value: s.value, color: s.color }))
          : [
              { label: 'F', value: cust.foot, color: SERVICE_COLORS.foot },
              { label: 'B', value: cust.body, color: SERVICE_COLORS.body },
              { label: 'C', value: cust.combo, color: SERVICE_COLORS.combo },
              { label: 'A', value: cust.chair, color: SERVICE_COLORS.chair },
              { label: 'H', value: head, color: SERVICE_COLORS.head },
            ]

        return (
          <div key={cust.id} className="flex items-start gap-3">
            <span className={`w-6 h-6 flex-shrink-0 mt-0.5 flex items-center justify-center rounded-full text-xs font-bold ${
              i === 0 ? 'bg-[#0F766E] text-white' : i < 3 ? 'bg-gray-200 text-gray-700' : 'bg-gray-100 text-gray-500'
            }`}>
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <div className="min-w-0">
                  <span className="text-sm font-medium text-gray-900 truncate block">{cust.name}</span>
                  <span className="text-xs text-gray-400">{cust.phone}</span>
                </div>
                <span className="text-sm font-semibold text-gray-700 ml-2 whitespace-nowrap">
                  {cust.visitCount} {t('analytics.visits')}
                </span>
              </div>
              {/* Stacked bar */}
              <div className="w-full bg-gray-100 rounded-full h-3 flex overflow-hidden" style={{ width: `${barWidth}%` }}>
                {segments.map((seg) => (
                  <div
                    key={seg.key}
                    className="h-full"
                    style={{ width: `${(seg.value / cust.visitCount) * 100}%`, backgroundColor: seg.color }}
                  />
                ))}
              </div>
              {/* Breakdown labels */}
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                {labels.map((s) => (
                  <span key={s.label} className="flex items-center gap-1 text-xs text-gray-500">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.label}: {s.value}
                    <span className="text-gray-400">
                      ({cust.visitCount > 0 ? Math.round((s.value / cust.visitCount) * 100) : 0}%)
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export type { TopCustomer }
