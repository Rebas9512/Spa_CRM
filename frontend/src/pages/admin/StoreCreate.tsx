import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { apiFetch } from '../../lib/apiClient'
import { useAppStore } from '../../store/appStore'
import { useTranslation } from '../../i18n'

export default function StoreCreate() {
  const navigate = useNavigate()
  const setBoundStoreId = useAppStore((s) => s.setBoundStoreId)
  const { t } = useTranslation()

  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [timezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone)
  const [staffPin, setStaffPin] = useState('')
  const [adminPin, setAdminPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Success state
  const [createdStore, setCreatedStore] = useState<{ id: string; name: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!name.trim()) {
      setError(t('admin.storeNameRequired'))
      return
    }
    if (staffPin === adminPin) {
      setError(t('admin.pinsMustDiffer'))
      return
    }

    setLoading(true)
    try {
      const res = await apiFetch<{ storeId: string; name: string }>('/api/admin/stores', {
        method: 'POST',
        body: JSON.stringify({ name, address, phone, staffPin, adminPin, timezone }),
      })
      setCreatedStore({ id: res.storeId, name: res.name })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.saveFailed'))
    } finally {
      setLoading(false)
    }
  }

  const handleEnterStore = () => {
    if (!createdStore) return
    setBoundStoreId(createdStore.id)
    navigate(`/s/${createdStore.id}/pin`)
  }

  const handleCopyId = async () => {
    if (!createdStore) return
    await navigator.clipboard.writeText(createdStore.id)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Success screen after store creation
  if (createdStore) {
    return (
      <div className="min-h-screen bg-white font-['Inter',sans-serif]">
        <div className="max-w-[560px] mx-auto px-6 py-8">
          <div className="bg-[#FAFAFA] border border-gray-200 rounded-xl p-8 text-center">
            {/* Success icon */}
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#D1FAE5] flex items-center justify-center">
              <svg className="w-8 h-8 text-[#065F46]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <h1 className="text-xl font-bold text-gray-900 mb-2">
              {t('admin.storeCreated')}
            </h1>
            <p className="text-base font-medium text-gray-700 mb-6">{createdStore.name}</p>

            {/* Store ID display + copy */}
            <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
              <p className="text-xs font-medium text-[#6B7280] mb-1">{t('admin.storeIdLabel')}</p>
              <div className="flex items-center justify-center gap-2">
                <code className="text-sm font-mono text-gray-900 select-all">{createdStore.id}</code>
                <button
                  onClick={handleCopyId}
                  className="text-xs text-[#0F766E] font-medium hover:underline"
                >
                  {copied ? t('admin.copied') : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-3">
              <button
                onClick={handleEnterStore}
                className="w-full h-11 bg-[#0F766E] hover:bg-[#0d6b63] text-white text-[15px] font-semibold rounded-lg transition-colors"
              >
                {t('admin.enterStore')} &rarr;
              </button>
              <button
                onClick={() => navigate('/admin/dashboard')}
                className="w-full h-11 border border-gray-200 text-gray-700 text-[15px] font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                {t('admin.backToDashboard')}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white font-['Inter',sans-serif]">
      <div className="max-w-[560px] mx-auto px-6 py-8">
        <Link
          to="/admin/dashboard"
          className="text-[#0F766E] text-sm font-medium hover:underline inline-flex items-center gap-1 mb-6"
        >
          &larr; {t('admin.backToDashboard')}
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          {t('header.createStore')}
        </h1>

        <form
          onSubmit={handleSubmit}
          className="bg-[#FAFAFA] border border-gray-200 rounded-xl p-6 flex flex-col gap-5"
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">
              {t('label.storeName')} *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">
              {t('label.address')}
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">
              {t('label.phone')}
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">
              {t('admin.timezone')}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={timezone}
                readOnly
                className="h-11 rounded-lg border border-gray-200 bg-[#F3F4F6] px-3 text-sm flex-1"
              />
              <span className="text-xs font-medium text-[#0F766E] bg-[#CCFBF1] px-2 py-1 rounded">
                {t('admin.autoDetected')}
              </span>
            </div>
          </div>

          <hr className="border-gray-200" />

          <h3 className="text-[15px] font-semibold text-gray-900">
            {t('admin.pinConfiguration')}
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                {t('admin.staffPin')}
              </label>
              <input
                type="password"
                value={staffPin}
                onChange={(e) => setStaffPin(e.target.value)}
                required
                maxLength={4}
                className="h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                {t('admin.adminPin')}
              </label>
              <input
                type="password"
                value={adminPin}
                onChange={(e) => setAdminPin(e.target.value)}
                required
                maxLength={4}
                className="h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
              />
            </div>
          </div>

          <p className="text-xs italic text-[#9CA3AF]">
            {t('admin.pinsMustDiffer')}
          </p>

          {error && (
            <p className="text-red-500 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="h-11 bg-[#0F766E] hover:bg-[#0d6b63] text-white text-[15px] font-semibold rounded-lg disabled:opacity-50 transition-colors"
          >
            {loading ? t('common.loading') : t('btn.createStore')}
          </button>
        </form>
      </div>
    </div>
  )
}
