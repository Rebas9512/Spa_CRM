import { useState, useCallback, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/apiClient'
import { useAppStore } from '../../store/appStore'
import { useTranslation } from '../../i18n'
import AdminTable from '../../components/AdminTable'
import { formatLocalTime } from '../../lib/timezone'
import StoreAnalytics from '../../components/StoreAnalytics'
import { normalizeTechnique } from '../../components/VisitHistory'
import CsvExportButton from '../../components/CsvExportButton'
import BulkFormExport from '../../components/BulkFormExport'

// ---------------------------------------------------------------------------
// Types (same shape as manage API responses)
// ---------------------------------------------------------------------------
interface Customer {
  id: string
  firstName: string
  lastName: string
  phone: string
  email: string | null
  loyaltyPoints: number
  lastVisit: string
  totalVisits: number
}

interface Visit {
  id: string
  visitDate: string
  customerName: string
  phone: string
  serviceType: string | null
  therapistServiceTechnique: string | null
  therapistName: string | null
  therapistSignedAt: string | null
  pointsRedeemed: number
  pointsAfter: number | null
  cancelledAt: string | null
  storeName: string | null
}

interface StoreInfo {
  id: string
  name: string
  address: string | null
  phone: string | null
}

type Tab = 'customers' | 'visits' | 'analytics' | 'export' | 'settings' | 'store-settings'

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'zh', label: '中文' },
]
const TIMEZONE_OPTIONS = [
  'America/New_York', 'America/Chicago', 'America/Denver',
  'America/Los_Angeles', 'America/Phoenix', 'Pacific/Honolulu',
  'Asia/Shanghai', 'Asia/Tokyo',
]
const DATE_FORMAT_OPTIONS = ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD']

function loadGeneralSettings() {
  try {
    const raw = localStorage.getItem('spa-crm-general-settings')
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return { language: 'zh', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, dateFormat: 'MM/DD/YYYY' }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function StoreManagePage() {
  const { storeId } = useParams<{ storeId: string }>()
  const navigate = useNavigate()
  const adminSession = useAppStore((s) => s.adminSession)
  const { t } = useTranslation()

  function visitStatus(v: Visit) {
    if (v.cancelledAt) return { label: t('status.cancelled'), bg: '#FEE2E2', color: '#991B1B' }
    if (v.therapistSignedAt) return { label: t('status.completed'), bg: '#D1FAE5', color: '#065F46' }
    return { label: t('status.active'), bg: '#DBEAFE', color: '#1E40AF' }
  }

  const [tab, setTab] = useState<Tab>('customers')

  // Customers
  const [customers, setCustomers] = useState<Customer[]>([])
  const [custSearch, setCustSearch] = useState('')
  const [custPage, setCustPage] = useState(1)
  const [custTotal, setCustTotal] = useState(0)
  const [custLoading, setCustLoading] = useState(false)
  const custPageSize = 20

  // Visits
  const [visits, setVisits] = useState<Visit[]>([])
  const [visitDateRange, setVisitDateRange] = useState({ from: '', to: '' })
  const [visitPage, setVisitPage] = useState(1)
  const [visitTotal, setVisitTotal] = useState(0)
  const [visitLoading, setVisitLoading] = useState(false)
  const visitPageSize = 50

  // General Settings
  const [generalSettings, setGeneralSettings] = useState(loadGeneralSettings)
  const [settingsSaved, setSettingsSaved] = useState(false)

  // Store Settings (admin only)
  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null)
  const [settingsName, setSettingsName] = useState('')
  const [settingsAddress, setSettingsAddress] = useState('')
  const [settingsPhone, setSettingsPhone] = useState('')
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [changingStaffPin, setChangingStaffPin] = useState(false)
  const [changingAdminPin, setChangingAdminPin] = useState(false)
  const [staffPin, setStaffPin] = useState('')
  const [adminPin, setAdminPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [storeSaved, setStoreSaved] = useState(false)

  useEffect(() => {
    if (!adminSession || !storeId) return
    apiFetch<{ store: StoreInfo }>(`/api/admin/stores/${storeId}`).then((res) => {
      setStoreInfo(res.store)
      setSettingsName(res.store.name)
      setSettingsAddress(res.store.address ?? '')
      setSettingsPhone(res.store.phone ?? '')
    }).catch(() => {})
  }, [adminSession, storeId])

  const handleSaveStoreSettings = async () => {
    if (!storeId) return
    setSettingsSaving(true)
    try {
      await apiFetch(`/api/admin/stores/${storeId}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: settingsName,
          address: settingsAddress,
          phone: settingsPhone,
        }),
      })
      setStoreInfo((prev) =>
        prev ? { ...prev, name: settingsName, address: settingsAddress, phone: settingsPhone } : prev,
      )
      setStoreSaved(true)
      setTimeout(() => setStoreSaved(false), 3000)
    } finally {
      setSettingsSaving(false)
    }
  }

  const handleSavePins = async () => {
    if (!storeId) return
    setPinError('')
    if (staffPin && adminPin && staffPin === adminPin) {
      setPinError(t('admin.pinsMustDiffer'))
      return
    }
    const body: Record<string, string> = {}
    if (staffPin) body.staffPin = staffPin
    if (adminPin) body.adminPin = adminPin
    if (Object.keys(body).length === 0) return
    try {
      await apiFetch(`/api/admin/stores/${storeId}/pins`, {
        method: 'PUT',
        body: JSON.stringify(body),
      })
      setStaffPin('')
      setAdminPin('')
      setChangingStaffPin(false)
      setChangingAdminPin(false)
    } catch (err) {
      setPinError(String(err))
    }
  }

  // Fetch customers
  const fetchCustomers = useCallback(async () => {
    setCustLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(custPage),
        pageSize: String(custPageSize),
      })
      if (custSearch) params.set('search', custSearch)
      const res = await apiFetch<{ customers: Customer[]; total: number }>(
        `/api/manage/customers?${params}`,
      )
      setCustomers(res.customers)
      setCustTotal(res.total)
    } finally {
      setCustLoading(false)
    }
  }, [custPage, custSearch])

  useEffect(() => {
    if (tab === 'customers') fetchCustomers()
  }, [tab, fetchCustomers])

  // Fetch visits
  const fetchVisits = useCallback(async () => {
    setVisitLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(visitPage),
        pageSize: String(visitPageSize),
      })
      if (visitDateRange.from) params.set('dateFrom', visitDateRange.from)
      if (visitDateRange.to) params.set('dateTo', visitDateRange.to)
      const res = await apiFetch<{ visits: Visit[]; total: number }>(
        `/api/manage/visits?${params}`,
      )
      setVisits(res.visits)
      setVisitTotal(res.total)
    } finally {
      setVisitLoading(false)
    }
  }, [visitPage, visitDateRange])

  useEffect(() => {
    if (tab === 'visits') fetchVisits()
  }, [tab, fetchVisits])

  const tabs: { key: Tab; label: string }[] = [
    { key: 'customers', label: t('nav.customers') },
    { key: 'visits', label: t('admin.visits') },
    { key: 'analytics', label: t('analytics.title') },
    { key: 'export', label: t('admin.export') },
    { key: 'settings', label: t('header.generalSettings') },
    ...(adminSession ? [{ key: 'store-settings' as Tab, label: t('admin.storeInfo') }] : []),
  ]

  const custTotalPages = Math.max(1, Math.ceil(custTotal / custPageSize))
  const visitTotalPages = Math.max(1, Math.ceil(visitTotal / visitPageSize))

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate(`/s/${storeId}`)}
            className="px-4 py-2 text-sm font-semibold text-white bg-[#0F766E] rounded-lg active:bg-[#0d6b63] transition-colors"
          >
            &larr; {t('manage.backToStaff')}
          </button>
          <h1 className="text-lg font-bold text-gray-900">
            {t('header.storeManagement')}
          </h1>
          {adminSession ? (
            <button
              onClick={() => navigate('/admin/dashboard')}
              className="px-4 py-2 text-sm font-semibold text-white bg-[#0F766E] rounded-lg active:bg-[#0d6b63] transition-colors"
            >
              {t('admin.backToAdmin')} &rarr;
            </button>
          ) : (
            <div className="w-[1px]" />
          )}
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Tab bar */}
        <div className="flex border-b border-gray-200 mb-6">
          {tabs.map((tb) => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={`px-4 py-3 text-sm font-medium transition-colors ${
                tab === tb.key
                  ? 'text-[#0F766E] font-semibold border-b-2 border-[#0F766E]'
                  : 'text-[#6B7280] hover:text-gray-900'
              }`}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {/* Customers */}
        {tab === 'customers' && (
          <AdminTable<Customer & Record<string, unknown>>
            columns={[
              {
                key: 'name',
                label: t('label.name'),
                render: (c) => `${c.firstName} ${c.lastName}`,
              },
              { key: 'phone', label: t('label.phone') },
              { key: 'loyaltyPoints', label: '★ ' + t('profile.loyaltyPoints'), width: '100px', render: (c) => String(c.loyaltyPoints ?? 0) },
              { key: 'lastVisit', label: t('table.lastVisit'), render: (c) => formatLocalTime(c.lastVisit as string) },
              { key: 'totalVisits', label: t('table.totalVisits'), width: '100px' },
            ]}
            data={customers as (Customer & Record<string, unknown>)[]}
            totalPages={custTotalPages}
            currentPage={custPage}
            onPageChange={(p) => setCustPage(p)}
            searchValue={custSearch}
            onSearchChange={(v) => {
              setCustSearch(v)
              setCustPage(1)
            }}
            searchPlaceholder={t('customers.searchPlaceholder')}
            onRowClick={(c) =>
              navigate(`/s/${storeId}/manage/customers/${c.id}`)
            }
            isLoading={custLoading}
          />
        )}

        {/* Visits */}
        {tab === 'visits' && (
          <AdminTable<Visit & Record<string, unknown>>
            columns={[
              { key: 'visitDate', label: t('table.date'), render: (v) => formatLocalTime(v.visitDate as string) },
              { key: 'customerName', label: t('table.customer') },
              { key: 'storeName', label: t('visit.location') },
              { key: 'serviceType', label: t('table.service'), render: (v) => {
                const visit = v as unknown as Visit
                return visit.cancelledAt ? '-' : normalizeTechnique(visit.therapistServiceTechnique)
              }},
              { key: 'therapistName', label: t('table.therapist') },
              { key: 'pointsRedeemed', label: t('visit.pointsRedeemed'), render: (v) => {
                const visit = v as unknown as Visit
                if (visit.cancelledAt || !visit.therapistSignedAt) return '-'
                return visit.pointsRedeemed > 0
                  ? <span className="text-amber-600 font-medium">{t('common.yes')}</span>
                  : t('common.no')
              }},
              { key: 'pointsAfter', label: t('visit.pointsAfter'), render: (v) => {
                const visit = v as unknown as Visit
                if (visit.cancelledAt || !visit.therapistSignedAt) return '-'
                return visit.pointsAfter != null ? String(visit.pointsAfter) : '-'
              }},
              {
                key: 'status',
                label: t('table.status'),
                render: (v) => {
                  const s = visitStatus(v as unknown as Visit)
                  return (
                    <span
                      className="px-2 py-0.5 text-xs font-medium rounded-full"
                      style={{ backgroundColor: s.bg, color: s.color }}
                    >
                      {s.label}
                    </span>
                  )
                },
              },
            ]}
            data={visits as (Visit & Record<string, unknown>)[]}
            totalPages={visitTotalPages}
            currentPage={visitPage}
            onPageChange={(p) => setVisitPage(p)}
            dateRange={visitDateRange}
            onDateRangeChange={(r) => {
              setVisitDateRange(r)
              setVisitPage(1)
            }}
            isLoading={visitLoading}
          />
        )}

        {/* Analytics */}
        {tab === 'analytics' && <StoreAnalytics />}

        {/* Export */}
        {tab === 'export' && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-gray-900">
              {t('admin.export')}
            </h2>
            <div className="flex flex-col sm:flex-row gap-4">
              <CsvExportButton
                endpoint="/api/manage/export/customers"
                filename="customers.csv"
                label={t('export.customers')}
              />
              <CsvExportButton
                endpoint="/api/manage/export/visits"
                filename="visits.csv"
                label={t('export.visits')}
              />
            </div>
            <BulkFormExport />
          </div>
        )}

        {/* General Settings */}
        {tab === 'settings' && (
          <div className="max-w-xl">
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              {/* Language */}
              <div className="flex items-center justify-between py-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">{t('admin.language')}</p>
                  <p className="text-xs text-[#6B7280] mt-0.5">{t('admin.languageDesc')}</p>
                </div>
                <select
                  value={generalSettings.language}
                  onChange={(e) => { setSettingsSaved(false); setGeneralSettings((p: Record<string, string>) => ({ ...p, language: e.target.value })) }}
                  className="w-[200px] h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                >
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <hr className="border-gray-200" />

              {/* Timezone */}
              <div className="flex items-center justify-between py-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">{t('admin.timezone')}</p>
                  <p className="text-xs text-[#6B7280] mt-0.5">{t('admin.timezoneDesc')}</p>
                </div>
                <select
                  value={generalSettings.timezone}
                  onChange={(e) => { setSettingsSaved(false); setGeneralSettings((p: Record<string, string>) => ({ ...p, timezone: e.target.value })) }}
                  className="w-[200px] h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                >
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </div>

              <hr className="border-gray-200" />

              {/* Date Format */}
              <div className="flex items-center justify-between py-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">{t('admin.dateFormat')}</p>
                  <p className="text-xs text-[#6B7280] mt-0.5">{t('admin.dateFormatDesc')}</p>
                </div>
                <select
                  value={generalSettings.dateFormat}
                  onChange={(e) => { setSettingsSaved(false); setGeneralSettings((p: Record<string, string>) => ({ ...p, dateFormat: e.target.value })) }}
                  className="w-[200px] h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                >
                  {DATE_FORMAT_OPTIONS.map((fmt) => (
                    <option key={fmt} value={fmt}>{fmt}</option>
                  ))}
                </select>
              </div>
            </div>

            {settingsSaved && (
              <p className="text-green-600 text-sm mt-3">{t('admin.saveSuccess')}</p>
            )}

            <button
              onClick={() => {
                localStorage.setItem('spa-crm-general-settings', JSON.stringify(generalSettings))
                setSettingsSaved(true)
                setTimeout(() => setSettingsSaved(false), 3000)
              }}
              className="w-full h-11 mt-4 bg-[#0F766E] active:bg-[#0d6b63] text-white text-[15px] font-semibold rounded-lg transition-colors"
            >
              {t('admin.saveChanges')}
            </button>
          </div>
        )}

        {/* Store Settings (admin only) */}
        {tab === 'store-settings' && adminSession && (
          <div className="space-y-8">
            {/* Store Information */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-4">
                {t('admin.storeInfo')}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('label.storeName')}
                  </label>
                  <input
                    type="text"
                    value={settingsName}
                    onChange={(e) => setSettingsName(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm
                               focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('label.address')}
                  </label>
                  <input
                    type="text"
                    value={settingsAddress}
                    onChange={(e) => setSettingsAddress(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm
                               focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('label.phone')}
                  </label>
                  <input
                    type="text"
                    value={settingsPhone}
                    onChange={(e) => setSettingsPhone(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm
                               focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
                  />
                </div>
              </div>
            </section>

            {/* PIN Management */}
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-4">
                {t('admin.pinManagement')}
              </h2>
              {pinError && (
                <p className="text-red-600 text-sm mb-3">{pinError}</p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
                {/* Staff PIN */}
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    {t('admin.staffPin')}
                  </p>
                  {changingStaffPin ? (
                    <input
                      type="password"
                      maxLength={6}
                      value={staffPin}
                      onChange={(e) => setStaffPin(e.target.value.replace(/\D/g, ''))}
                      placeholder="Enter new PIN"
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm
                                 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                    />
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-lg tracking-widest text-gray-500">
                        ••••
                      </span>
                      <button
                        onClick={() => setChangingStaffPin(true)}
                        className="text-sm font-medium text-[#0F766E] rounded-lg border border-gray-200
                                   px-3 py-1.5 active:bg-teal-50 transition-colors"
                      >
                        {t('admin.change')}
                      </button>
                    </div>
                  )}
                </div>

                {/* Admin PIN */}
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    {t('admin.adminPin')}
                  </p>
                  {changingAdminPin ? (
                    <input
                      type="password"
                      maxLength={6}
                      value={adminPin}
                      onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, ''))}
                      placeholder="Enter new PIN"
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm
                                 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                    />
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-lg tracking-widest text-gray-500">
                        ••••
                      </span>
                      <button
                        onClick={() => setChangingAdminPin(true)}
                        className="text-sm font-medium text-[#0F766E] rounded-lg border border-gray-200
                                   px-3 py-1.5 active:bg-teal-50 transition-colors"
                      >
                        {t('admin.change')}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Save button */}
            <button
              onClick={async () => {
                await handleSaveStoreSettings()
                if (staffPin || adminPin) await handleSavePins()
              }}
              disabled={settingsSaving}
              className="rounded-lg bg-[#0F766E] px-6 py-2.5 text-sm font-medium text-white
                         active:bg-teal-700 disabled:opacity-50 transition-colors"
            >
              {settingsSaving ? t('common.saving') : t('admin.saveChanges')}
            </button>
            {storeSaved && (
              <p className="text-green-600 text-sm mt-3">{t('admin.saveSuccess')}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
