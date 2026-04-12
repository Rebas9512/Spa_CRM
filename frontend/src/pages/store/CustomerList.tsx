import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../lib/apiClient'
import { useTranslation } from '../../i18n'
import { normalizeTechnique } from '../../components/VisitHistory'
import type { CustomerSummary } from '../../components/CustomerCard'

export default function CustomerList() {
  const { storeId } = useParams<{ storeId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [search, setSearch] = useState('')

  type CustomerRow = CustomerSummary & {
    lastService: string | null
    lastTherapist: string | null
    loyaltyPoints: number
    isRecent: boolean
  }

  type ApiCustomer = {
    id: string; firstName: string; lastName: string; phone: string;
    lastVisitDate: string | null; lastService: string | null; lastTherapist: string | null;
    totalVisits: number; intakeStatus: string | null; healthStatus: string; loyaltyPoints: number;
  }

  const mapToRow = (r: ApiCustomer, isRecent: boolean): CustomerRow => ({
    id: r.id,
    name: `${r.firstName} ${r.lastName}`,
    phone: r.phone,
    lastVisit: r.lastVisitDate,
    totalVisits: r.totalVisits,
    healthStatus: r.healthStatus as 'ok' | 'alert',
    lastService: r.lastService,
    lastTherapist: r.lastTherapist,
    loyaltyPoints: r.loyaltyPoints,
    isRecent,
  })

  const { data: recentCustomers = [], isLoading: recentLoading } = useQuery({
    queryKey: ['customers-recent', storeId],
    queryFn: async () => {
      const res = await apiFetch<{ customers: ApiCustomer[] }>(`/api/customers/recent?limit=20`)
      return res.customers.map((r) => mapToRow(r, true))
    },
    enabled: !!storeId,
  })

  const [debouncedSearch, setDebouncedSearch] = useState('')
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [])

  const handleSearchChange = (value: string) => {
    setSearch(value)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(value.trim()), 300)
  }

  const { data: searchResults = [], isLoading: searchLoading } = useQuery({
    queryKey: ['customers-lookup', debouncedSearch],
    queryFn: async () => {
      const res = await apiFetch<{ customers: ApiCustomer[] }>(
        `/api/customers/lookup?q=${encodeURIComponent(debouncedSearch)}`,
      )
      return res.customers.map((r) => mapToRow(r, false))
    },
    enabled: debouncedSearch.length >= 1,
  })

  const isLoading = debouncedSearch ? searchLoading : recentLoading
  const filtered = debouncedSearch ? searchResults : recentCustomers

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-['Inter',sans-serif]">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => navigate(`/s/${storeId}/`)}
          className="text-[#0F766E] font-medium text-sm hover:underline"
        >
          &larr; {t('nav.main')}
        </button>
        <h1 className="text-xl font-bold text-gray-900">
          {t('customers.title')}
        </h1>
      </header>

      {/* Search */}
      <div className="px-6 pt-4">
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder={t('customers.searchPlaceholder')}
          className="w-full max-w-md px-4 py-2.5 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
        />
      </div>

      {/* Table */}
      <div className="px-6 pt-4 overflow-x-auto">
        <table className="w-full text-left bg-white rounded-xl overflow-hidden shadow-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="py-3 px-4 text-xs font-medium text-gray-500 uppercase">
                {t('customers.colCustomer')}
              </th>
              <th className="py-3 px-4 text-xs font-medium text-gray-500 uppercase">
                {t('customers.colPhone')}
              </th>
              <th className="py-3 px-4 text-xs font-medium text-gray-500 uppercase">
                {t('customers.colLastService')}
              </th>
              <th className="py-3 px-4 text-xs font-medium text-gray-500 uppercase">
                {t('customers.colTherapist')}
              </th>
              <th className="py-3 px-4 text-xs font-medium text-gray-500 uppercase">
                ★ {t('profile.loyaltyPoints')}
              </th>
              <th className="py-3 px-4 text-xs font-medium text-gray-500 uppercase">
                {t('customers.colHealth')}
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr
                key={c.id}
                onClick={() => navigate(`/s/${storeId}/customer/${c.id}`)}
                className={`border-b border-gray-100 active:bg-gray-50 cursor-pointer transition-colors ${
                  c.isRecent ? 'bg-green-50' : ''
                }`}
              >
                <td className="py-3 px-4 font-medium text-gray-900">
                  {c.name}
                </td>
                <td className="py-3 px-4 text-gray-600">{c.phone}</td>
                <td className="py-3 px-4 text-gray-600">
                  {normalizeTechnique(c.lastService)}
                </td>
                <td className="py-3 px-4 text-gray-600">
                  {c.lastTherapist ?? '-'}
                </td>
                <td className="py-3 px-4 text-amber-700 font-medium">
                  {c.loyaltyPoints}
                </td>
                <td className="py-3 px-4">
                  {c.healthStatus === 'ok' ? (
                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">
                      OK
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700">
                      {t('health.alert')}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="py-8 text-center text-gray-400 text-sm"
                >
                  {isLoading ? t('common.loading') : t('customers.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
