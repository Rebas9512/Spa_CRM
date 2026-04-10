import { useState } from 'react'
import { useAppStore } from '../store/appStore'
import { useTranslation } from '../i18n'

interface CsvExportButtonProps {
  endpoint: string
  filename: string
  label?: string
  params?: Record<string, string>
}

export default function CsvExportButton({
  endpoint,
  filename,
  label,
  params,
}: CsvExportButtonProps) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const { storeSession, adminSession } = useAppStore()

  const handleExport = async () => {
    setLoading(true)
    try {
      const url = new URL(endpoint, window.location.origin)
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          if (v) url.searchParams.set(k, v)
        })
      }

      const headers: Record<string, string> = {}
      if (endpoint.startsWith('/api/admin') && adminSession?.token) {
        headers['Authorization'] = `Bearer ${adminSession.token}`
      } else if (storeSession?.token) {
        headers['Authorization'] = `Bearer ${storeSession.token}`
      }

      const res = await fetch(url.toString(), { headers })
      if (!res.ok) throw new Error(`Export failed: ${res.status}`)

      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
    } catch (err) {
      console.error('CSV export error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white
                 px-5 py-3 text-sm font-medium text-[#0F766E] shadow-sm
                 hover:bg-teal-50 disabled:opacity-50 transition-colors"
    >
      <svg
        className="w-4 h-4"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3"
        />
      </svg>
      {loading ? t('common.loading') : label ?? t('btn.export')}
    </button>
  )
}
