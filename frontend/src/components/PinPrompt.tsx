import { useState, useCallback, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import { apiFetch } from '../lib/apiClient'
import { useTranslation } from '../i18n'

interface PinPromptProps {
  requiredRole?: 'staff' | 'store_admin'
  onSuccess?: (pin?: string) => void
  /** When true, skip store-pin verification — just collect 4 digits and pass them back via onSuccess */
  collectOnly?: boolean
  onCancel?: () => void
}

export default function PinPrompt({ requiredRole, onSuccess, collectOnly, onCancel }: PinPromptProps) {
  const { storeId } = useParams()
  const { setStoreSession, setAccessLevel } = useAppStore()
  const [digits, setDigits] = useState<string[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [shake, setShake] = useState(false)
  const { t } = useTranslation()

  // Shake animation reset
  useEffect(() => {
    if (shake) {
      const timer = setTimeout(() => setShake(false), 500)
      return () => clearTimeout(timer)
    }
  }, [shake])

  const showError = useCallback((msg: string) => {
    setError(msg)
    setDigits([])
    setShake(true)
  }, [])

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

    const enteredPin = digits.join('')

    // collectOnly mode: just return the raw PIN without calling store-pin
    if (collectOnly) {
      onSuccess?.(enteredPin)
      return
    }

    setLoading(true)
    try {
      const data = await apiFetch<{
        token: string; role: string; storeName: string; sessionId: string; isNewSession: boolean
      }>('/api/auth/store-pin', {
        method: 'POST',
        body: JSON.stringify({ storeId, pin: enteredPin }),
      })

      // If requiredRole is specified, check it
      if (requiredRole && data.role !== requiredRole) {
        showError(requiredRole === 'store_admin' ? t('pin.needAdmin') : t('pin.wrongRole'))
        setLoading(false)
        return
      }

      setStoreSession({
        token: data.token,
        storeId,
        role: data.role as 'staff' | 'store_admin',
        sessionId: data.sessionId,
        sessionStartAt: new Date().toISOString(),
      })
      setAccessLevel(data.role === 'store_admin' ? 'admin' : 'staff')
      onSuccess?.(enteredPin)
    } catch {
      showError(t('pin.invalid'))
    } finally {
      setLoading(false)
    }
  }, [digits, storeId, requiredRole, collectOnly, setStoreSession, setAccessLevel, onSuccess, showError, t])

  const numpadKeys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['back', '0', 'submit'],
  ]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8 w-80 flex flex-col items-center gap-6 relative">
        {/* Cancel / Close button */}
        {onCancel && (
          <button
            onClick={onCancel}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        <p className="text-gray-500 text-base">{t('pin.enter')}</p>

        {/* 4-dot indicator */}
        <div className={`flex gap-4 ${shake ? 'animate-shake' : ''}`}>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`w-5 h-5 rounded-full border-2 transition-colors ${
                i < digits.length
                  ? error
                    ? 'bg-red-500 border-red-500'
                    : 'bg-primary border-primary'
                  : 'bg-white border-gray-200'
              }`}
            />
          ))}
        </div>

        {/* Error message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 w-full text-center">
            <p className="text-red-600 text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Numpad */}
        <div className="flex flex-col gap-3">
          {numpadKeys.map((row, ri) => (
            <div key={ri} className="flex gap-3">
              {row.map((key) => {
                if (key === 'back') {
                  return (
                    <button key={key} onClick={handleBackspace}
                      className="w-[72px] h-[72px] rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-400 text-xl active:bg-gray-100">
                      ⌫
                    </button>
                  )
                }
                if (key === 'submit') {
                  return (
                    <button key={key} onClick={handleSubmit} disabled={digits.length !== 4 || loading}
                      className="w-[72px] h-[72px] rounded-lg bg-primary text-white flex items-center justify-center text-xl disabled:opacity-50 active:bg-[#0d6b63]">
                      {loading ? '…' : '✓'}
                    </button>
                  )
                }
                return (
                  <button key={key} onClick={() => handleDigit(key)}
                    className="w-[72px] h-[72px] rounded-lg bg-gray-50 border border-gray-200 text-gray-900 text-2xl font-medium active:bg-gray-100">
                    {key}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        {/* Cancel text button (fallback if no X button) */}
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-gray-400 text-sm hover:text-gray-600"
          >
            {t('common.cancel')}
          </button>
        )}
      </div>
    </div>
  )
}
