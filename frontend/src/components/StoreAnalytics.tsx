import { useState, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { exportElementToPdf } from '../lib/exportPdf'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../lib/apiClient'
import { useTranslation } from '../i18n'
import TopCustomers, { type TopCustomer } from './TopCustomers'

// ── Types ──
interface TrendPoint {
  label: string
  total: number
  completed: number
  cancelled: number
}

interface ServiceBreakdown {
  foot: number
  body: number
  combo: number
  chair: number
  total: number
}

interface RedemptionMonth {
  month: string
  count: number
  amount: number
}

interface Rates {
  total: number
  completed: number
  cancelled: number
  redeemed: number
  redeemedAmount: number
  cancellationRate: number
  redemptionByMonth: RedemptionMonth[]
}

type TrendPeriod = 'day' | 'week' | 'month' | 'year'
type ServicePeriod = 'week' | 'month' | 'year'

// ── Format X-axis label ──
function formatLabel(label: string): string {
  if (label.length === 2) return `${parseInt(label)}:00`
  if (label.length === 10) return `${parseInt(label.slice(5, 7))}/${parseInt(label.slice(8))}`
  if (label.length === 7) return `${parseInt(label.slice(5))}月`
  return label
}

// ── SVG Line Chart with crosshair interaction ──
function TrendChart({ data, height = 220 }: { data: TrendPoint[]; height?: number }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [activeIdx, setActiveIdx] = useState<number | null>(null)

  if (data.length === 0) return <div className="text-center text-gray-400 py-10">No data</div>

  const W = 600
  const H = height
  const padTop = 30
  const padBottom = 40
  const padLeft = 40
  const padRight = 10
  const chartW = W - padLeft - padRight
  const chartH = H - padTop - padBottom

  const maxVal = Math.max(...data.map((d) => d.total), 1)
  const yTicks = 5
  const stepX = data.length > 1 ? chartW / (data.length - 1) : chartW

  const toX = (i: number) => padLeft + (data.length > 1 ? i * stepX : chartW / 2)
  const toY = (v: number) => padTop + chartH - (v / maxVal) * chartH

  const totalLine = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${toX(i)},${toY(d.total)}`).join(' ')
  const completedLine = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${toX(i)},${toY(d.completed)}`).join(' ')
  const areaPath = `${totalLine} L${toX(data.length - 1)},${padTop + chartH} L${toX(0)},${padTop + chartH} Z`

  // Convert pointer position to nearest data index
  const resolveIndex = useCallback((clientX: number) => {
    const svg = svgRef.current
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    const svgX = ((clientX - rect.left) / rect.width) * W
    const chartX = svgX - padLeft
    if (chartX < -stepX / 2 || chartX > chartW + stepX / 2) return null
    return Math.max(0, Math.min(data.length - 1, Math.round(chartX / stepX)))
  }, [data.length, stepX, chartW])

  const handleMove = useCallback((clientX: number) => {
    setActiveIdx(resolveIndex(clientX))
  }, [resolveIndex])

  const handleLeave = useCallback(() => setActiveIdx(null), [])

  const active = activeIdx !== null ? data[activeIdx] : null

  return (
    <div className="relative">
      {/* Floating data panel */}
      <div className={`absolute top-0 left-0 right-0 flex justify-center pointer-events-none transition-opacity ${active ? 'opacity-100' : 'opacity-0'}`}>
        <div className="bg-gray-900/90 text-white text-xs rounded-lg px-3 py-1.5 flex items-center gap-3">
          <span className="font-medium">{active ? formatLabel(active.label) : ''}</span>
          <span><span className="text-[#5EEAD4]">{active?.total ?? 0}</span> total</span>
          <span><span className="text-[#34D399]">{active?.completed ?? 0}</span> done</span>
          {(active?.cancelled ?? 0) > 0 && <span><span className="text-red-400">{active?.cancelled}</span> cancel</span>}
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full select-none"
        preserveAspectRatio="xMidYMid meet"
        onMouseMove={(e) => handleMove(e.clientX)}
        onMouseLeave={handleLeave}
        onTouchMove={(e) => { e.preventDefault(); handleMove(e.touches[0].clientX) }}
        onTouchEnd={handleLeave}
      >
        {/* Grid lines */}
        {Array.from({ length: yTicks + 1 }).map((_, i) => {
          const y = padTop + (chartH / yTicks) * i
          const val = Math.round(maxVal - (maxVal / yTicks) * i)
          return (
            <g key={i}>
              <line x1={padLeft} y1={y} x2={W - padRight} y2={y} stroke="#E5E7EB" strokeWidth={0.5} />
              <text x={padLeft - 6} y={y + 4} textAnchor="end" fontSize={10} fill="#9CA3AF">{val}</text>
            </g>
          )
        })}

        {/* Area fill */}
        <path d={areaPath} fill="#0F766E" opacity={0.08} />

        {/* Completed line */}
        <path d={completedLine} fill="none" stroke="#10B981" strokeWidth={1.5} strokeDasharray="4 3" />

        {/* Total line */}
        <path d={totalLine} fill="none" stroke="#0F766E" strokeWidth={2} />

        {/* Dots (dim when crosshair active) */}
        {data.map((d, i) => (
          <circle
            key={i}
            cx={toX(i)}
            cy={toY(d.total)}
            r={activeIdx === i ? 5 : 3}
            fill={activeIdx === i ? '#0F766E' : activeIdx !== null ? '#0F766E40' : '#0F766E'}
            className="transition-all duration-100"
          />
        ))}

        {/* Crosshair */}
        {activeIdx !== null && (
          <g>
            <line
              x1={toX(activeIdx)} y1={padTop}
              x2={toX(activeIdx)} y2={padTop + chartH}
              stroke="#0F766E" strokeWidth={1} strokeDasharray="3 2" opacity={0.6}
            />
            <circle cx={toX(activeIdx)} cy={toY(data[activeIdx].completed)} r={4} fill="#10B981" stroke="white" strokeWidth={1.5} />
            <circle cx={toX(activeIdx)} cy={toY(data[activeIdx].total)} r={4} fill="#0F766E" stroke="white" strokeWidth={1.5} />
          </g>
        )}

        {/* X labels */}
        {data.map((d, i) => {
          const showEvery = data.length > 15 ? 5 : data.length > 7 ? 2 : 1
          if (i % showEvery !== 0 && i !== data.length - 1) return null
          const isActive = activeIdx === i
          return (
            <text
              key={i}
              x={toX(i)}
              y={H - 8}
              textAnchor="middle"
              fontSize={isActive ? 10 : 9}
              fontWeight={isActive ? 600 : 400}
              fill={isActive ? '#0F766E' : '#9CA3AF'}
            >
              {formatLabel(d.label)}
            </text>
          )
        })}
      </svg>
    </div>
  )
}

// ── Bar Chart for Service Breakdown ──
function ServiceChart({ data }: { data: ServiceBreakdown }) {
  const items = [
    { key: 'Foot (F)', value: data.foot, color: '#0F766E' },
    { key: 'Body (B)', value: data.body, color: '#F59E0B' },
    { key: 'Combo (C)', value: data.combo, color: '#6366F1' },
    { key: 'Chair (A)', value: data.chair, color: '#EC4899' },
  ]
  const maxVal = Math.max(...items.map((i) => i.value), 1)

  return (
    <div className="flex items-end gap-6 justify-center py-4" style={{ height: 160 }}>
      {items.map((item) => (
        <div key={item.key} className="flex flex-col items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">{item.value}</span>
          <div
            className="rounded-t-md transition-all duration-300"
            style={{
              width: 48,
              height: Math.max(4, (item.value / maxVal) * 100),
              backgroundColor: item.color,
            }}
          />
          <span className="text-xs text-gray-500">{item.key}</span>
        </div>
      ))}
    </div>
  )
}

// ── Rate Card ──
function RateCard({ label, value, rate, color }: {
  label: string; value: number; rate: number; color: string
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-1">
      <span className="text-xs text-gray-500 uppercase">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold" style={{ color }}>{rate}%</span>
        <span className="text-sm text-gray-400">({value})</span>
      </div>
    </div>
  )
}

// ── Period Switcher ──
function PeriodSwitch<T extends string>({ options, value, onChange }: {
  options: { key: T; label: string }[]; value: T; onChange: (v: T) => void
}) {
  return (
    <div className="flex bg-gray-100 rounded-lg p-0.5">
      {options.map((opt) => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
            value === opt.key
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ── Therapist Ranking ──
interface TherapistEntry {
  name: string
  count: number
  foot: number
  body: number
  combo: number
  chair: number
  variants: string[]
}

const SERVICE_COLORS = {
  foot: '#0F766E',
  body: '#F59E0B',
  combo: '#6366F1',
  chair: '#EC4899',
} as const

function TherapistRanking({ data }: { data: TherapistEntry[] }) {
  if (data.length === 0) return <div className="text-center text-gray-400 py-6">No data</div>
  const maxCount = Math.max(...data.map((d) => d.count), 1)

  return (
    <div className="space-y-4">
      {data.map((entry, i) => {
        const other = entry.count - entry.foot - entry.body - entry.combo - entry.chair
        const segments = [
          { key: 'F', value: entry.foot, color: SERVICE_COLORS.foot },
          { key: 'B', value: entry.body, color: SERVICE_COLORS.body },
          { key: 'C', value: entry.combo, color: SERVICE_COLORS.combo },
          { key: 'A', value: entry.chair, color: SERVICE_COLORS.chair },
          ...(other > 0 ? [{ key: '?', value: other, color: '#D1D5DB' }] : []),
        ].filter((s) => s.value > 0)
        const barWidth = (entry.count / maxCount) * 100

        return (
          <div key={i} className="flex items-start gap-3">
            <span className={`w-6 h-6 flex-shrink-0 mt-0.5 flex items-center justify-center rounded-full text-xs font-bold ${
              i === 0 ? 'bg-[#0F766E] text-white' : i < 3 ? 'bg-gray-200 text-gray-700' : 'bg-gray-100 text-gray-500'
            }`}>
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-900 truncate">{entry.name}</span>
                <span className="text-sm font-semibold text-gray-700 ml-2">{entry.count}</span>
              </div>
              {/* Stacked bar */}
              <div className="w-full bg-gray-100 rounded-full h-3 flex overflow-hidden" style={{ width: `${barWidth}%` }}>
                {segments.map((seg) => (
                  <div
                    key={seg.key}
                    className="h-full transition-all duration-300"
                    style={{
                      width: `${(seg.value / entry.count) * 100}%`,
                      backgroundColor: seg.color,
                    }}
                  />
                ))}
              </div>
              {/* Breakdown labels */}
              <div className="flex items-center gap-3 mt-1">
                {[
                  { label: 'F', value: entry.foot, color: SERVICE_COLORS.foot },
                  { label: 'B', value: entry.body, color: SERVICE_COLORS.body },
                  { label: 'C', value: entry.combo, color: SERVICE_COLORS.combo },
                  { label: 'A', value: entry.chair, color: SERVICE_COLORS.chair },
                ].map((s) => (
                  <span key={s.label} className="flex items-center gap-1 text-xs text-gray-500">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.label}: {s.value}
                    <span className="text-gray-400">
                      ({entry.count > 0 ? Math.round((s.value / entry.count) * 100) : 0}%)
                    </span>
                  </span>
                ))}
              </div>
              {entry.variants.length > 1 && (
                <p className="text-xs text-gray-400 mt-0.5 truncate">
                  {entry.variants.join(', ')}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main Component ──
export default function StoreAnalytics() {
  const { t } = useTranslation()
  const { storeId } = useParams<{ storeId: string }>()
  const containerRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>('day')
  const [servicePeriod, setServicePeriod] = useState<ServicePeriod>('month')
  const [therapistPeriod, setTherapistPeriod] = useState<'month' | 'year'>('month')

  const trendQuery = useQuery({
    queryKey: ['analytics-trend', storeId, trendPeriod],
    queryFn: () => apiFetch<{ trend: TrendPoint[] }>(`/api/manage/analytics/visit-trend?period=${trendPeriod}`),
  })

  const serviceQuery = useQuery({
    queryKey: ['analytics-service', storeId, servicePeriod],
    queryFn: () => apiFetch<{ breakdown: ServiceBreakdown }>(`/api/manage/analytics/service-breakdown?period=${servicePeriod}`),
  })

  const therapistQuery = useQuery({
    queryKey: ['analytics-therapist', storeId, therapistPeriod],
    queryFn: () => apiFetch<{ ranking: TherapistEntry[] }>(`/api/manage/analytics/therapist-ranking?period=${therapistPeriod}`),
  })

  const topCustQuery = useQuery({
    queryKey: ['analytics-top-customers', storeId],
    queryFn: () => apiFetch<{ customers: TopCustomer[] }>('/api/manage/analytics/top-customers'),
  })

  const ratesQuery = useQuery({
    queryKey: ['analytics-rates', storeId],
    queryFn: () => apiFetch<{ rates: Rates }>('/api/manage/analytics/rates'),
  })

  const therapistRanking = therapistQuery.data?.ranking ?? []
  const trend = trendQuery.data?.trend ?? []
  const breakdown = serviceQuery.data?.breakdown ?? { foot: 0, body: 0, combo: 0, chair: 0, total: 0 }
  const rates = ratesQuery.data?.rates ?? {
    total: 0, completed: 0, cancelled: 0, redeemed: 0, redeemedAmount: 0,
    cancellationRate: 0, redemptionByMonth: [],
  }

  const handleExport = async () => {
    if (!containerRef.current || exporting) return
    setExporting(true)
    try {
      await exportElementToPdf(containerRef.current, `store-analytics-${storeId}.pdf`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div ref={containerRef} className="space-y-6">
      {/* Export Button */}
      <div className="flex justify-end no-print">
        <button
          onClick={handleExport}
          disabled={exporting}
          className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          {exporting ? t('common.saving') : t('analytics.exportPdf')}
        </button>
      </div>

      {/* Visit Trend */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900 uppercase">
            {t('analytics.visitTrend')}
          </h3>
          <PeriodSwitch
            options={[
              { key: 'day' as TrendPeriod, label: t('analytics.daily') },
              { key: 'week' as TrendPeriod, label: t('analytics.weekly') },
              { key: 'month' as TrendPeriod, label: t('analytics.monthly') },
              { key: 'year' as TrendPeriod, label: t('analytics.yearly') },
            ]}
            value={trendPeriod}
            onChange={setTrendPeriod}
          />
        </div>
        <div className="flex items-center gap-4 mb-2 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5 bg-[#0F766E]" /> {t('analytics.totalVisits')}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5 bg-[#10B981]" style={{ borderTop: '1px dashed #10B981', height: 0 }} /> {t('analytics.completedVisits')}
          </span>
        </div>
        {trendQuery.isLoading ? (
          <div className="text-center text-gray-400 py-10">{t('common.loading')}</div>
        ) : (
          <TrendChart data={trend} />
        )}
      </div>

      {/* Service Breakdown + Rates in a row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Service Breakdown */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900 uppercase">
              {t('analytics.serviceBreakdown')}
            </h3>
            <PeriodSwitch
              options={[
                { key: 'week' as ServicePeriod, label: t('analytics.weekly') },
                { key: 'month' as ServicePeriod, label: t('analytics.monthly') },
                { key: 'year' as ServicePeriod, label: t('analytics.yearly') },
              ]}
              value={servicePeriod}
              onChange={setServicePeriod}
            />
          </div>
          {serviceQuery.isLoading ? (
            <div className="text-center text-gray-400 py-10">{t('common.loading')}</div>
          ) : (
            <ServiceChart data={breakdown} />
          )}
          <p className="text-center text-xs text-gray-400 mt-2">
            {t('analytics.totalCompleted')}: {breakdown.total}
          </p>
        </div>

        {/* Rates + Summary */}
        <div className="flex flex-col gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-1">
            <span className="text-xs text-gray-500 uppercase">{t('analytics.totalVisits')}</span>
            <span className="text-2xl font-bold text-gray-900">{rates.total}</span>
            <span className="text-xs text-gray-400">
              {rates.completed} {t('analytics.completedVisits')} · {rates.cancelled} {t('analytics.cancelledVisits')}
            </span>
          </div>
          <RateCard
            label={t('analytics.cancellationRate')}
            value={rates.cancelled}
            rate={rates.cancellationRate}
            color="#EF4444"
          />
          <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-2">
            <span className="text-xs text-gray-500 uppercase">{t('analytics.redemptionTotal')}</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-amber-600">${rates.redeemedAmount}</span>
              <span className="text-sm text-gray-400">({rates.redeemed} {t('analytics.redemptionTimes')})</span>
            </div>
            {/* Monthly mini bars */}
            <div className="flex items-end gap-1 mt-1" style={{ height: 48 }}>
              {rates.redemptionByMonth.map((m) => {
                const maxAmt = Math.max(...rates.redemptionByMonth.map((x) => x.amount), 1)
                const h = m.amount > 0 ? Math.max(4, (m.amount / maxAmt) * 40) : 2
                return (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-0.5">
                    <span className={`text-[9px] font-medium ${m.count > 0 ? 'text-amber-600' : 'text-gray-300'}`}>
                      {m.count > 0 ? m.count : ''}
                    </span>
                    <div
                      className="w-full rounded-t-sm"
                      style={{ height: h, backgroundColor: m.amount > 0 ? '#F59E0B' : '#E5E7EB' }}
                      title={`${m.month}: ${m.count} × $50 = $${m.amount}`}
                    />
                  </div>
                )
              })}
            </div>
            <div className="flex gap-1 text-center">
              {rates.redemptionByMonth.map((m) => (
                <span key={m.month} className="flex-1 text-[9px] text-gray-400">
                  {parseInt(m.month.slice(5))}月
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Therapist Ranking */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900 uppercase">
            {t('analytics.therapistRanking')}
          </h3>
          <PeriodSwitch
            options={[
              { key: 'month' as const, label: t('analytics.monthly') },
              { key: 'year' as const, label: t('analytics.yearly') },
            ]}
            value={therapistPeriod}
            onChange={setTherapistPeriod}
          />
        </div>
        {therapistQuery.isLoading ? (
          <div className="text-center text-gray-400 py-10">{t('common.loading')}</div>
        ) : (
          <TherapistRanking data={therapistRanking} />
        )}
      </div>

      {/* Top Customers */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-900 uppercase mb-4">
          {t('analytics.topCustomers')}
        </h3>
        {topCustQuery.isLoading ? (
          <div className="text-center text-gray-400 py-10">{t('common.loading')}</div>
        ) : (
          <TopCustomers customers={topCustQuery.data?.customers ?? []} />
        )}
      </div>
    </div>
  )
}
