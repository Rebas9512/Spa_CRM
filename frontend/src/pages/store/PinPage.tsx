import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import { apiFetch } from '../../lib/apiClient'
import { useTranslation } from '../../i18n'

export default function PinPage() {
  const { storeId } = useParams<{ storeId: string }>()
  const navigate = useNavigate()
  const {
    setStoreSession,
    setAccessLevel,
    returnAfterPin,
    setReturnAfterPin,
  } = useAppStore()

  const { t } = useTranslation()

  const [storeName, setStoreName] = useState('')
  const [digits, setDigits] = useState<string[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Fetch store info on mount
  useEffect(() => {
    if (!storeId) return
    apiFetch<{ name: string; isOpen: boolean }>(
      `/api/stores/${encodeURIComponent(storeId)}/info`,
    )
      .then((data) => setStoreName(data.name))
      .catch(() => setStoreName(storeId))
  }, [storeId])

  // Auto store-join attempt on mount (skip PIN if store already open)
  useEffect(() => {
    if (!storeId) return
    apiFetch<{
      token: string
      role: string
      storeName: string
      sessionId: string
    }>('/api/auth/store-join', {
      method: 'POST',
      body: JSON.stringify({ storeId }),
    })
      .then((data) => {
        setStoreSession({
          token: data.token,
          storeId,
          role: data.role as 'staff' | 'store_admin',
          sessionId: data.sessionId,
          sessionStartAt: new Date().toISOString(),
        })
        setAccessLevel('staff')
        if (returnAfterPin) {
          const dest = returnAfterPin
          setReturnAfterPin(null)
          navigate(dest)
        } else {
          navigate(`/s/${storeId}/`)
        }
      })
      .catch(() => {
        // Store not open — user needs to enter PIN
      })
  }, [storeId, setStoreSession, setAccessLevel, returnAfterPin, setReturnAfterPin, navigate])

  const handleDigit = useCallback((d: string) => {
    setError('')
    setDigits((prev) => (prev.length < 4 ? [...prev, d] : prev))
  }, [])

  const handleBackspace = useCallback(() => {
    setError('')
    setDigits((prev) => prev.slice(0, -1))
  }, [])

  const handleSubmit = useCallback(async () => {
    if (digits.length !== 4 || !storeId) return
    setLoading(true)
    setError('')
    try {
      const data = await apiFetch<{
        token: string
        role: string
        storeName: string
        sessionId: string
        isNewSession: boolean
      }>('/api/auth/store-pin', {
        method: 'POST',
        body: JSON.stringify({ storeId, pin: digits.join('') }),
      })

      setStoreSession({
        token: data.token,
        storeId,
        role: data.role as 'staff' | 'store_admin',
        sessionId: data.sessionId,
        sessionStartAt: new Date().toISOString(),
      })
      setAccessLevel('staff')

      // Navigate based on returnAfterPin — always go to staff main
      if (returnAfterPin) {
        const dest = returnAfterPin
        setReturnAfterPin(null)
        navigate(dest)
      } else {
        navigate(`/s/${storeId}/`)
      }
    } catch {
      setError(t('pin.invalid'))
      setDigits([])
    } finally {
      setLoading(false)
    }
  }, [
    digits,
    storeId,
    returnAfterPin,
    setStoreSession,
    setAccessLevel,
    setReturnAfterPin,
    navigate,
    t,
  ])

  const numpadKeys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['back', '0', 'submit'],
  ]

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center font-['Inter',sans-serif]">
      {/* Store name */}
      {storeName && (
        <h1 className="text-2xl font-bold text-gray-900 mb-8">{storeName}</h1>
      )}

      {/* Enter PIN label */}
      <p className="text-gray-500 text-base mb-6">{t('pin.enter')}</p>

      {/* 4-dot indicator */}
      <div className="flex gap-4 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`w-5 h-5 rounded-full border-2 transition-colors ${
              i < digits.length
                ? 'bg-[#0F766E] border-[#0F766E]'
                : 'bg-white border-gray-300'
            }`}
          />
        ))}
      </div>

      {/* Error message */}
      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      {/* Numpad */}
      <div className="flex flex-col gap-3">
        {numpadKeys.map((row, ri) => (
          <div key={ri} className="flex gap-3">
            {row.map((key) => {
              if (key === 'back') {
                return (
                  <button
                    key={key}
                    onClick={handleBackspace}
                    className="w-[72px] h-[72px] rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-400 text-xl active:bg-gray-100"
                  >
                    &#x232B;
                  </button>
                )
              }
              if (key === 'submit') {
                return (
                  <button
                    key={key}
                    onClick={handleSubmit}
                    disabled={digits.length !== 4 || loading}
                    className="w-[72px] h-[72px] rounded-lg bg-[#0F766E] text-white flex items-center justify-center text-xl disabled:opacity-50 active:bg-[#0d6b63]"
                  >
                    &#x2713;
                  </button>
                )
              }
              return (
                <button
                  key={key}
                  onClick={() => handleDigit(key)}
                  className="w-[72px] h-[72px] rounded-lg bg-gray-50 border border-gray-200 text-gray-900 text-2xl font-medium active:bg-gray-100"
                >
                  {key}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
