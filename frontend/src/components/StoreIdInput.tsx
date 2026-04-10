import { useState } from 'react'
import { apiFetch } from '../lib/apiClient'
import { useTranslation } from '../i18n'

interface StoreIdInputProps {
  onSync: (storeId: string, storeName: string) => void
}

export default function StoreIdInput({ onSync }: StoreIdInputProps) {
  const [storeId, setStoreId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { t } = useTranslation()

  const handleSync = async () => {
    const trimmed = storeId.trim()
    if (!trimmed) return

    setLoading(true)
    setError('')
    try {
      const data = await apiFetch<{ name: string; isOpen: boolean }>(
        `/api/stores/${encodeURIComponent(trimmed)}/info`,
      )
      onSync(trimmed, data.name)
    } catch {
      setError(t('landing.invalidStore'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        type="text"
        value={storeId}
        onChange={(e) => {
          setStoreId(e.target.value)
          setError('')
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSync()
        }}
        placeholder={t('landing.storeIdPlaceholder')}
        className="w-full px-4 py-3 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0F766E] focus:border-transparent"
      />
      <button
        onClick={handleSync}
        disabled={loading || !storeId.trim()}
        className="w-full py-3 bg-[#0F766E] text-white font-medium rounded-lg hover:bg-[#0d6b63] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? t('landing.syncing') : t('landing.syncButton')}
      </button>
      {error && <p className="text-red-500 text-sm text-center">{error}</p>}
    </div>
  )
}
