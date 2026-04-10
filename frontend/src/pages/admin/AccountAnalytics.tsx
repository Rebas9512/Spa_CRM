import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../lib/apiClient'
import { useTranslation } from '../../i18n'
import { useAppStore } from '../../store/appStore'
import { exportElementToPdf } from '../../lib/exportPdf'
import TopCustomers, { type TopCustomer } from '../../components/TopCustomers'

// ── Types ──
interface StoreSeriesPoint { label: string; total: number }
interface StoreSeries { storeId: string; storeName: string; data: StoreSeriesPoint[] }
interface CustomerOverview {
  totalCustomers: number; newThisMonth: number
  crossStoreCustomers: number; crossStoreRate: number
  newCustomerTrend: { month: string; count: number }[]
}
interface PointsOverview {
  totalIssued: number; totalRedeemed: number; totalRedeemedAmount: number
  storeRedemptions: { name: string; count: number; amount: number }[]
  redemptionByMonth: { month: string; count: number; amount: number }[]
}
interface ServiceOverview {
  serviceBreakdown: { foot: number; body: number; combo: number; total: number }
  storeCancellationRates: { name: string; total: number; cancelled: number; rate: number }[]
}

const STORE_COLORS = ['#0F766E', '#F59E0B', '#6366F1', '#EF4444', '#EC4899', '#8B5CF6']
const SERVICE_COLORS = { foot: '#0F766E', body: '#F59E0B', combo: '#6366F1' }

// ── Period Switcher ──
function PeriodSwitch<T extends string>({ options, value, onChange }: {
  options: { key: T; label: string }[]; value: T; onChange: (v: T) => void
}) {
  return (
    <div className="flex bg-gray-100 rounded-lg p-0.5">
      {options.map((opt) => (
        <button key={opt.key} onClick={() => onChange(opt.key)}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
            value === opt.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}>{opt.label}</button>
      ))}
    </div>
  )
}

// ── Stat Card ──
function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-1">
      <span className="text-xs text-gray-500 uppercase">{label}</span>
      <span className="text-2xl font-bold" style={{ color: color ?? '#111' }}>{value}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  )
}

// ── Multi-line Chart (store comparison) ──
function MultiLineChart({ storeData, slots }: { storeData: StoreSeries[]; slots: string[] }) {
  if (slots.length === 0) return null
  const W = 700, H = 220, padTop = 20, padBottom = 40, padLeft = 40, padRight = 10
  const chartW = W - padLeft - padRight, chartH = H - padTop - padBottom

  const allValues = storeData.flatMap((s) => s.data.map((d) => d.total))
  const maxVal = Math.max(...allValues, 1)
  const stepX = slots.length > 1 ? chartW / (slots.length - 1) : chartW
  const toX = (i: number) => padLeft + (slots.length > 1 ? i * stepX : chartW / 2)
  const toY = (v: number) => padTop + chartH - (v / maxVal) * chartH

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        {/* Grid */}
        {Array.from({ length: 5 }).map((_, i) => {
          const y = padTop + (chartH / 4) * i
          return <line key={i} x1={padLeft} y1={y} x2={W - padRight} y2={y} stroke="#E5E7EB" strokeWidth={0.5} />
        })}
        {/* Lines per store */}
        {storeData.map((store, si) => {
          const color = STORE_COLORS[si % STORE_COLORS.length]
          const line = store.data.map((d, i) => `${i === 0 ? 'M' : 'L'}${toX(i)},${toY(d.total)}`).join(' ')
          return (
            <g key={store.storeId}>
              <path d={line} fill="none" stroke={color} strokeWidth={2} />
              {store.data.map((d, i) => (
                <circle key={i} cx={toX(i)} cy={toY(d.total)} r={2.5} fill={color}>
                  <title>{`${store.storeName} ${d.label}: ${d.total}`}</title>
                </circle>
              ))}
            </g>
          )
        })}
        {/* X labels */}
        {slots.map((s, i) => {
          const showEvery = slots.length > 15 ? 5 : slots.length > 7 ? 2 : 1
          if (i % showEvery !== 0 && i !== slots.length - 1) return null
          let label = s
          if (s.length === 10) label = `${parseInt(s.slice(5, 7))}/${parseInt(s.slice(8))}`
          else if (s.length === 7) label = `${parseInt(s.slice(5))}月`
          return <text key={i} x={toX(i)} y={H - 8} textAnchor="middle" fontSize={9} fill="#9CA3AF">{label}</text>
        })}
      </svg>
      {/* Legend */}
      <div className="flex items-center gap-4 justify-center mt-2">
        {storeData.map((store, si) => (
          <span key={store.storeId} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="inline-block w-3 h-1 rounded" style={{ backgroundColor: STORE_COLORS[si % STORE_COLORS.length] }} />
            {store.storeName}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Horizontal Bar List ──
function HBarList({ items, color }: { items: { label: string; value: number; sub?: string }[]; color?: string }) {
  const max = Math.max(...items.map((i) => i.value), 1)
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i}>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-sm text-gray-700">{item.label}</span>
            <span className="text-sm font-semibold text-gray-900">{item.value}{item.sub ? <span className="text-xs text-gray-400 ml-1">{item.sub}</span> : null}</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div className="h-2 rounded-full transition-all duration-300" style={{ width: `${(item.value / max) * 100}%`, backgroundColor: color ?? '#0F766E' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Mini Sparkline ──
function Sparkline({ data, color = '#0F766E' }: { data: number[]; color?: string }) {
  if (data.length === 0) return null
  const W = 200, H = 40, max = Math.max(...data, 1)
  const step = data.length > 1 ? W / (data.length - 1) : W
  const pts = data.map((v, i) => `${i * step},${H - (v / max) * (H - 4) - 2}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 40 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} />
      {data.map((v, i) => v > 0 ? <circle key={i} cx={i * step} cy={H - (v / max) * (H - 4) - 2} r={2} fill={color} /> : null)}
    </svg>
  )
}

// ── Main Component ──
export default function AccountAnalytics() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const adminId = useAppStore((s) => s.adminSession?.adminId)
  const containerRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)
  const [compPeriod, setCompPeriod] = useState<'month' | 'year'>('year')
  const [topCustMode, setTopCustMode] = useState<'service' | 'store'>('service')

  const handleExport = async () => {
    if (!containerRef.current || exporting) return
    setExporting(true)
    try {
      await exportElementToPdf(containerRef.current, `account-analytics-${new Date().toISOString().slice(0, 10)}.pdf`)
    } catch (err) {
      console.error('PDF export failed:', err)
    } finally {
      setExporting(false)
    }
  }

  const compQuery = useQuery({
    queryKey: ['acct-analytics-comparison', adminId, compPeriod],
    queryFn: () => apiFetch<{ stores: StoreSeries[]; slots: string[] }>(`/api/admin/analytics/store-comparison?period=${compPeriod}`),
  })
  const custQuery = useQuery({
    queryKey: ['acct-analytics-customers', adminId],
    queryFn: () => apiFetch<CustomerOverview>('/api/admin/analytics/customers-overview'),
  })
  const ptsQuery = useQuery({
    queryKey: ['acct-analytics-points', adminId],
    queryFn: () => apiFetch<PointsOverview>('/api/admin/analytics/points-overview'),
  })
  const topCustQuery = useQuery({
    queryKey: ['acct-analytics-top-customers', adminId],
    queryFn: () => apiFetch<{ customers: TopCustomer[] }>('/api/admin/analytics/top-customers'),
  })
  const svcQuery = useQuery({
    queryKey: ['acct-analytics-service', adminId],
    queryFn: () => apiFetch<ServiceOverview>('/api/admin/analytics/service-overview'),
  })

  const comp = compQuery.data
  const cust = custQuery.data
  const pts = ptsQuery.data
  const svc = svcQuery.data

  return (
    <div className="min-h-screen bg-gray-50 font-['Inter',sans-serif]">
      {/* Header */}
      <div className="bg-white flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB] no-print">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/admin/dashboard')} className="text-[#0F766E] font-medium text-sm hover:underline">
            &larr; {t('header.adminDashboard')}
          </button>
          <h1 className="text-xl font-bold text-gray-900">{t('analytics.accountTitle')}</h1>
        </div>
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

      <div ref={containerRef} className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        <h1 className="text-xl font-bold text-gray-900 hidden print-title">
          {t('analytics.accountTitle')} — {new Date().toLocaleDateString()}
        </h1>
        {/* 1. Store Comparison */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900 uppercase">{t('analytics.storeComparison')}</h3>
            <PeriodSwitch
              options={[
                { key: 'month' as const, label: t('analytics.monthly') },
                { key: 'year' as const, label: t('analytics.yearly') },
              ]}
              value={compPeriod} onChange={setCompPeriod}
            />
          </div>
          {compQuery.isLoading ? (
            <div className="text-center text-gray-400 py-10">{t('common.loading')}</div>
          ) : comp ? (
            <MultiLineChart storeData={comp.stores} slots={comp.slots} />
          ) : null}
        </div>

        {/* 2. Customer Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard label={t('analytics.totalCustomers')} value={cust?.totalCustomers ?? 0} />
          <StatCard label={t('analytics.newThisMonth')} value={cust?.newThisMonth ?? 0} color="#0F766E" />
          <StatCard
            label={t('analytics.crossStore')}
            value={cust?.crossStoreCustomers ?? 0}
            sub={`${cust?.crossStoreRate ?? 0}% ${t('analytics.crossStoreRate')}`}
            color="#6366F1"
          />
        </div>

        {/* New Customer Trend */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-900 uppercase mb-3">{t('analytics.newCustomerTrend')}</h3>
          <Sparkline data={(cust?.newCustomerTrend ?? []).map((m) => m.count)} color="#0F766E" />
          <div className="flex justify-between mt-1">
            {(cust?.newCustomerTrend ?? []).map((m) => (
              <span key={m.month} className="text-[9px] text-gray-400 flex-1 text-center">
                {m.count > 0 ? m.count : ''}
              </span>
            ))}
          </div>
          <div className="flex justify-between">
            {(cust?.newCustomerTrend ?? []).map((m) => (
              <span key={m.month} className="text-[9px] text-gray-400 flex-1 text-center">
                {parseInt(m.month.slice(5))}月
              </span>
            ))}
          </div>
        </div>

        {/* 3. Points + Service in a row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Points Overview */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 uppercase">{t('analytics.pointsRedeemed')}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-xs text-gray-500">{t('analytics.pointsIssued')}</span>
                <p className="text-xl font-bold text-gray-900">{pts?.totalIssued ?? 0}</p>
              </div>
              <div>
                <span className="text-xs text-gray-500">{t('analytics.redemptionTotal')}</span>
                <p className="text-xl font-bold text-amber-600">${pts?.totalRedeemedAmount ?? 0}</p>
                <p className="text-xs text-gray-400">{pts?.totalRedeemed ?? 0} {t('analytics.redemptionTimes')}</p>
              </div>
            </div>
            {/* Store redemptions */}
            <div>
              <span className="text-xs text-gray-500 uppercase">{t('analytics.storeRedemptions')}</span>
              <div className="mt-2">
                <HBarList
                  items={(pts?.storeRedemptions ?? []).map((s) => ({ label: s.name, value: s.count, sub: `$${s.amount}` }))}
                  color="#F59E0B"
                />
              </div>
            </div>
          </div>

          {/* Service + Cancel */}
          <div className="space-y-4">
            {/* Global F/B/C */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-900 uppercase mb-3">{t('analytics.globalService')}</h3>
              {svc && (
                <div className="flex items-end gap-6 justify-center" style={{ height: 100 }}>
                  {[
                    { key: 'Foot (F)', val: svc.serviceBreakdown.foot, color: SERVICE_COLORS.foot },
                    { key: 'Body (B)', val: svc.serviceBreakdown.body, color: SERVICE_COLORS.body },
                    { key: 'Combo (C)', val: svc.serviceBreakdown.combo, color: SERVICE_COLORS.combo },
                  ].map((s) => {
                    const max = Math.max(svc.serviceBreakdown.foot, svc.serviceBreakdown.body, svc.serviceBreakdown.combo, 1)
                    const pct = svc.serviceBreakdown.total > 0 ? Math.round((s.val / svc.serviceBreakdown.total) * 100) : 0
                    return (
                      <div key={s.key} className="flex flex-col items-center gap-1">
                        <span className="text-xs font-semibold text-gray-700">{s.val} <span className="text-gray-400">({pct}%)</span></span>
                        <div className="rounded-t-md" style={{ width: 40, height: Math.max(4, (s.val / max) * 70), backgroundColor: s.color }} />
                        <span className="text-xs text-gray-500">{s.key}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Store Cancel Rates */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-900 uppercase mb-3">{t('analytics.storeCancelRates')}</h3>
              <HBarList
                items={(svc?.storeCancellationRates ?? []).map((s) => ({
                  label: s.name, value: s.rate, sub: `${s.cancelled}/${s.total}`,
                }))}
                color="#EF4444"
              />
            </div>
          </div>
        </div>

        {/* 4. Top Customers */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900 uppercase">
              {t('analytics.topCustomers')}
            </h3>
            <PeriodSwitch
              options={[
                { key: 'service' as const, label: t('analytics.byService') },
                { key: 'store' as const, label: t('analytics.byStore') },
              ]}
              value={topCustMode} onChange={setTopCustMode}
            />
          </div>
          {topCustQuery.isLoading ? (
            <div className="text-center text-gray-400 py-10">{t('common.loading')}</div>
          ) : (
            <TopCustomers customers={topCustQuery.data?.customers ?? []} mode={topCustMode} />
          )}
        </div>
      </div>
    </div>
  )
}
