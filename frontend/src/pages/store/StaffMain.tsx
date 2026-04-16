import { useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { MASSAGE_TYPES } from '@spa-crm/shared'
import { useAppStore } from '../../store/appStore'
import { apiFetch } from '../../lib/apiClient'
import { useTranslation } from '../../i18n'
import PendingSignatureBanner from '../../components/PendingSignatureBanner'
import CustomerCard, { type CustomerSummary } from '../../components/CustomerCard'
import PinPrompt from '../../components/PinPrompt'

export default function StaffMain() {
  const { storeId } = useParams<{ storeId: string }>()
  const navigate = useNavigate()
  const { storeSession, setStoreSession, setPendingAssignment, setAccessLevel } = useAppStore()
  const { t, tEn } = useTranslation()

  const [phoneDigits, setPhoneDigits] = useState('')
  const [searchResult, setSearchResult] = useState<CustomerSummary | null>(null)
  const [searchError, setSearchError] = useState('')
  const [searching, setSearching] = useState(false)
  const [showManagePin, setShowManagePin] = useState(false)
  const [showCloseOutPin, setShowCloseOutPin] = useState(false)
  const [showCustomersPin, setShowCustomersPin] = useState(false)
  const [closeOutError, setCloseOutError] = useState('')

  const handleDigit = useCallback(
    (d: string) => {
      if (phoneDigits.length >= 11) return
      setPhoneDigits((prev) => prev + d)
      setSearchError('')
      setSearchResult(null)
    },
    [phoneDigits],
  )

  const handleBackspace = useCallback(() => {
    setPhoneDigits((prev) => prev.slice(0, -1))
    setSearchError('')
    setSearchResult(null)
  }, [])

  const handleClear = useCallback(() => {
    setPhoneDigits('')
    setSearchError('')
    setSearchResult(null)
  }, [])

  const handleSearch = useCallback(async () => {
    if (phoneDigits.length < 10) return
    setSearching(true)
    setSearchError('')
    setSearchResult(null)
    try {
      const resp = await apiFetch<{ customer: {
        id: string; firstName: string; lastName: string; phone: string;
        totalVisits: number; lastVisit: string | null; healthAlerts: Record<string, unknown>
      } }>(
        `/api/customers/search?phone=${encodeURIComponent(phoneDigits)}`,
      )
      const c = resp.customer
      setSearchResult({
        id: c.id,
        name: `${c.firstName} ${c.lastName}`,
        phone: c.phone,
        lastVisit: c.lastVisit,
        totalVisits: c.totalVisits,
        healthStatus: Object.values(c.healthAlerts || {}).some((v) => v === true) ? 'alert' : 'ok',
      })
    } catch {
      setSearchError(tEn('staff.customerNotFound'))
    } finally {
      setSearching(false)
    }
  }, [phoneDigits, tEn])

  const handleCloseOut = useCallback(async (pin: string) => {
    setCloseOutError('')
    try {
      await apiFetch('/api/auth/closeout', {
        method: 'POST',
        body: JSON.stringify({ pin }),
      })
      setStoreSession(null)
      navigate(`/s/${storeId}/pin`)
    } catch (err) {
      // 410 handler in apiFetch will redirect if store already closed
      // Other errors (e.g. pending signatures) should be shown to user
      if (err instanceof Error && !err.message.includes('Store closed')) {
        setCloseOutError(err.message)
      }
    }
  }, [storeId, setStoreSession, navigate])

  const numpadKeys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['back', '0', 'search'],
  ]

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-['Inter',sans-serif]">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">
          {storeSession?.storeId ? t('staff.storeName') : t('staff.title')}
        </h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCustomersPin(true)}
            className="px-4 py-2 text-gray-700 font-medium rounded-lg active:bg-gray-100 transition-colors text-sm"
          >
            {t('staff.customers')}
          </button>
          <button
            onClick={() => setShowManagePin(true)}
            className="px-4 py-2 text-gray-700 font-medium rounded-lg active:bg-gray-100 transition-colors text-sm"
          >
            {t('staff.manage')} &#x1F512;
          </button>
          <button
            onClick={() => setShowCloseOutPin(true)}
            className="px-4 py-2 bg-amber-100 text-amber-800 font-medium rounded-lg active:bg-amber-200 transition-colors text-sm"
          >
            {t('staff.closeOut')}
          </button>
        </div>
      </header>

      {/* Close-out error */}
      {closeOutError && (
        <div className="mx-6 mt-3 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {closeOutError}
        </div>
      )}

      {/* Pending Signature Banner */}
      <div className="px-6 pt-4">
        <PendingSignatureBanner />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex justify-center px-6 py-6">
        {/* Fixed-width container matching numpad (3×72 + 2×8 = 232px) + new client btn */}
        <div className="flex flex-col gap-4 items-center">
          {/* Phone input + New Client — same width as numpad */}
          <div className="flex items-center gap-2" style={{ width: 232 + 8 + 120 }}>
            <div className="h-12 bg-white border border-gray-200 rounded-lg flex items-center justify-center text-xl font-mono text-gray-900 tracking-wider" style={{ width: 232 }}>
              {phoneDigits || (
                <span className="text-gray-300 text-sm">{tEn('staff.enterPhone')}</span>
              )}
            </div>
            <button
              onClick={() => {
                setPendingAssignment({ serviceType: MASSAGE_TYPES[0].value })
                setAccessLevel('customer')
                navigate(`/s/${storeId}/intake/new`)
              }}
              className="h-12 rounded-lg bg-[#0F766E] active:bg-[#0d6b63] text-white flex items-center justify-center gap-2 font-semibold text-sm whitespace-nowrap"
              style={{ width: 120 }}
            >
              <span className="text-lg">+</span>
              {tEn('staff.newClient')}
            </button>
          </div>

          {/* NumPad */}
          <div className="flex flex-col gap-2">
            {numpadKeys.map((row, ri) => (
              <div key={ri} className="flex gap-2">
                {row.map((key) => {
                  if (key === 'back') {
                    return (
                      <button
                        key={key}
                        onClick={handleBackspace}
                        className="w-[72px] h-[56px] rounded-lg bg-gray-100 border border-gray-200 text-gray-400 text-xl flex items-center justify-center active:bg-gray-200"
                      >
                        ⌫
                      </button>
                    )
                  }
                  if (key === 'search') {
                    return (
                      <button
                        key={key}
                        onClick={handleSearch}
                        disabled={phoneDigits.length < 10 || searching}
                        className="w-[72px] h-[56px] rounded-lg bg-[#0F766E] text-white text-sm font-medium disabled:opacity-50 active:bg-[#0d6b63]"
                      >
                        {searching ? '...' : tEn('staff.search')}
                      </button>
                    )
                  }
                  return (
                    <button
                      key={key}
                      onClick={() => handleDigit(key)}
                      className="w-[72px] h-[56px] rounded-lg bg-white border border-gray-200 text-gray-900 text-xl font-medium active:bg-gray-50"
                    >
                      {key}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          {/* Search Result */}
          <div style={{ width: 232 + 8 + 120 }}>
            {searchResult && (
              <CustomerCard
                customer={searchResult}
                variant="search"
                forceEnglish
                onCheckIn={() =>
                  navigate(`/s/${storeId}/customer/${searchResult.id}/checkin`)
                }
              />
            )}
            {searchError && (
              <p className="text-red-500 text-sm text-center">{searchError}</p>
            )}
          </div>
        </div>
      </div>

      {showManagePin && (
        <PinPrompt
          requiredRole="store_admin"
          onSuccess={() => {
            setShowManagePin(false)
            navigate(`/s/${storeId}/manage`)
          }}
          onCancel={() => setShowManagePin(false)}
        />
      )}

      {showCloseOutPin && (
        <PinPrompt
          collectOnly
          onSuccess={(pin) => {
            setShowCloseOutPin(false)
            if (pin) handleCloseOut(pin)
          }}
          onCancel={() => setShowCloseOutPin(false)}
        />
      )}

      {showCustomersPin && (
        <PinPrompt
          onSuccess={() => {
            setShowCustomersPin(false)
            navigate(`/s/${storeId}/customers`)
          }}
          onCancel={() => setShowCustomersPin(false)}
        />
      )}
    </div>
  )
}
