import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/apiClient'
import { useAppStore } from '../../store/appStore'
import { useTranslation } from '../../i18n'
import AdminTable from '../../components/AdminTable'
import CsvExportButton from '../../components/CsvExportButton'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Customer {
  id: string
  firstName: string
  lastName: string
  phone: string
  email: string | null
  lastVisit: string
  totalVisits: number
}

interface Visit {
  id: string
  visitDate: string
  customerName: string
  phone: string
  serviceType: string | null
  therapistName: string | null
  therapistSignedAt: string | null
  cancelledAt: string | null
  storeName: string | null
}

interface StoreInfo {
  id: string
  name: string
  address: string | null
  phone: string | null
  timezone: string | null
}

type Tab = 'customers' | 'visits' | 'export' | 'settings'

// ---------------------------------------------------------------------------
// Visit status helper
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function StoreManage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const setBoundStoreId = useAppStore((s) => s.setBoundStoreId)
  const { t } = useTranslation()

  function visitStatus(v: Visit) {
    if (v.cancelledAt) return { label: t('status.cancelled'), bg: '#FEE2E2', color: '#991B1B' }
    if (v.therapistSignedAt) return { label: t('status.completed'), bg: '#D1FAE5', color: '#065F46' }
    return { label: t('status.active'), bg: '#DBEAFE', color: '#1E40AF' }
  }

  const [tab, setTab] = useState<Tab>('customers')
  const [store, setStore] = useState<StoreInfo | null>(null)

  // Customers state
  const [customers, setCustomers] = useState<Customer[]>([])
  const [custSearch, setCustSearch] = useState('')
  const [custDateRange, setCustDateRange] = useState({ from: '', to: '' })
  const [custPage, setCustPage] = useState(1)
  const [custTotal, setCustTotal] = useState(0)
  const [custLoading, setCustLoading] = useState(false)
  const custPageSize = 20

  // Visits state
  const [visits, setVisits] = useState<Visit[]>([])
  const [visitDateRange, setVisitDateRange] = useState({ from: '', to: '' })
  const [visitTherapist, setVisitTherapist] = useState('')
  const [visitPage, setVisitPage] = useState(1)
  const [visitTotal, setVisitTotal] = useState(0)
  const [visitLoading, setVisitLoading] = useState(false)
  const visitPageSize = 50

  // Settings state
  const [settingsName, setSettingsName] = useState('')
  const [settingsAddress, setSettingsAddress] = useState('')
  const [settingsPhone, setSettingsPhone] = useState('')
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [changingStaffPin, setChangingStaffPin] = useState(false)
  const [changingAdminPin, setChangingAdminPin] = useState(false)
  const [staffPin, setStaffPin] = useState('')
  const [adminPin, setAdminPin] = useState('')
  const [pinError, setPinError] = useState('')

  // Fetch store info
  useEffect(() => {
    if (!id) return
    apiFetch<{ store: StoreInfo }>(`/api/admin/stores/${id}`).then((res) => {
      setStore(res.store)
      setSettingsName(res.store.name)
      setSettingsAddress(res.store.address ?? '')
      setSettingsPhone(res.store.phone ?? '')
    })
  }, [id])

  // Fetch customers
  const fetchCustomers = useCallback(async () => {
    if (!id) return
    setCustLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(custPage),
        pageSize: String(custPageSize),
      })
      if (custSearch) params.set('search', custSearch)
      if (custDateRange.from) params.set('lastVisitAfter', custDateRange.from)
      const res = await apiFetch<{ customers: Customer[]; total: number }>(
        `/api/admin/stores/${id}/customers?${params}`,
      )
      setCustomers(res.customers)
      setCustTotal(res.total)
    } finally {
      setCustLoading(false)
    }
  }, [id, custPage, custSearch, custDateRange.from])

  useEffect(() => {
    if (tab === 'customers') fetchCustomers()
  }, [tab, fetchCustomers])

  // Fetch visits
  const fetchVisits = useCallback(async () => {
    if (!id) return
    setVisitLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(visitPage),
        pageSize: String(visitPageSize),
      })
      if (visitDateRange.from) params.set('dateFrom', visitDateRange.from)
      if (visitDateRange.to) params.set('dateTo', visitDateRange.to)
      if (visitTherapist) params.set('therapistName', visitTherapist)
      const res = await apiFetch<{ visits: Visit[]; total: number }>(
        `/api/admin/stores/${id}/visits?${params}`,
      )
      setVisits(res.visits)
      setVisitTotal(res.total)
    } finally {
      setVisitLoading(false)
    }
  }, [id, visitPage, visitDateRange, visitTherapist])

  useEffect(() => {
    if (tab === 'visits') fetchVisits()
  }, [tab, fetchVisits])

  // Save settings
  const handleSaveSettings = async () => {
    if (!id) return
    setSettingsSaving(true)
    try {
      await apiFetch(`/api/admin/stores/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: settingsName,
          address: settingsAddress,
          phone: settingsPhone,
        }),
      })
      setStore((prev) =>
        prev
          ? { ...prev, name: settingsName, address: settingsAddress, phone: settingsPhone }
          : prev,
      )
    } finally {
      setSettingsSaving(false)
    }
  }

  // Save PINs
  const handleSavePins = async () => {
    if (!id) return
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
      await apiFetch(`/api/admin/stores/${id}/pins`, {
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

  // Tab configs
  const tabs: { key: Tab; label: string }[] = [
    { key: 'customers', label: t('nav.customers') },
    { key: 'visits', label: t('admin.visits') },
    { key: 'export', label: t('admin.export') },
    { key: 'settings', label: t('admin.settings') },
  ]

  const custTotalPages = Math.max(1, Math.ceil(custTotal / custPageSize))
  const visitTotalPages = Math.max(1, Math.ceil(visitTotal / visitPageSize))

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/admin/dashboard')}
            className="text-[#0F766E] text-sm font-medium mb-1 hover:underline"
          >
            &larr; {t('admin.stores')}
          </button>
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold text-gray-900">
              {store?.name ?? t('common.loading')}
            </h1>
            <button
              onClick={() => {
                if (!id) return
                setBoundStoreId(id)
                navigate(`/s/${id}/pin`)
              }}
              className="px-4 py-2 bg-[#0F766E] hover:bg-[#0d6b63] text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {t('admin.enterStore')} &rarr;
            </button>
          </div>
        </div>

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

        {/* Tab content */}
        {tab === 'customers' && (
          <AdminTable<Customer & Record<string, unknown>>
            columns={[
              {
                key: 'name',
                label: t('label.name'),
                render: (c) => `${c.firstName} ${c.lastName}`,
              },
              { key: 'phone', label: t('label.phone') },
              { key: 'lastVisit', label: t('table.lastVisit') },
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
            dateRange={custDateRange}
            onDateRangeChange={(r) => {
              setCustDateRange(r)
              setCustPage(1)
            }}
            onRowClick={(c) => navigate(`/admin/stores/${id}/customers/${c.id}`)}
            isLoading={custLoading}
          />
        )}

        {tab === 'visits' && (
          <div className="space-y-4">
            {/* Therapist filter */}
            <div className="flex gap-3">
              <input
                type="text"
                value={visitTherapist}
                onChange={(e) => {
                  setVisitTherapist(e.target.value)
                  setVisitPage(1)
                }}
                placeholder={t('admin.filterTherapist')}
                className="px-4 py-2.5 rounded-lg border border-gray-200 text-sm
                           placeholder:text-gray-400 focus:outline-none focus:ring-2
                           focus:ring-teal-500/30 focus:border-teal-500"
              />
            </div>
            <AdminTable<Visit & Record<string, unknown>>
              columns={[
                { key: 'visitDate', label: t('table.date') },
                { key: 'customerName', label: t('table.customer') },
                { key: 'storeName', label: t('visit.location') },
                { key: 'serviceType', label: t('table.service') },
                { key: 'therapistName', label: t('table.therapist') },
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
          </div>
        )}

        {tab === 'export' && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-gray-900">
              {t('admin.export')}
            </h2>
            <div className="flex flex-col sm:flex-row gap-4">
              <CsvExportButton
                endpoint={`/api/admin/stores/${id}/export/customers`}
                filename="customers.csv"
                label={t('export.customers')}
              />
              <CsvExportButton
                endpoint={`/api/admin/stores/${id}/export/visits`}
                filename="visits.csv"
                label={t('export.visits')}
              />
            </div>
          </div>
        )}

        {tab === 'settings' && (
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
                                   px-3 py-1.5 hover:bg-teal-50 transition-colors"
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
                                   px-3 py-1.5 hover:bg-teal-50 transition-colors"
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
                await handleSaveSettings()
                if (staffPin || adminPin) await handleSavePins()
              }}
              disabled={settingsSaving}
              className="rounded-lg bg-[#0F766E] px-6 py-2.5 text-sm font-medium text-white
                         hover:bg-teal-700 disabled:opacity-50 transition-colors"
            >
              {settingsSaving ? t('common.saving') : t('admin.saveChanges')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
