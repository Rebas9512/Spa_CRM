import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../lib/apiClient'
import { useTranslation } from '../../i18n'

interface AdminProfile {
  id: string
  email: string
  name: string
}

export default function AccountSettings() {
  const { t } = useTranslation()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    apiFetch<{ admin: AdminProfile }>('/api/admin/me')
      .then((data) => {
        setName(data.admin.name)
        setEmail(data.admin.email)
      })
      .catch(() => {})
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (newPassword && newPassword !== confirmPassword) {
      setError(t('admin.passwordMismatch'))
      return
    }

    setLoading(true)
    try {
      await apiFetch('/api/admin/me', {
        method: 'PUT',
        body: JSON.stringify({
          name,
          ...(newPassword ? { currentPassword, newPassword } : {}),
        }),
      })
      setSuccess(t('admin.saveSuccess'))
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.saveFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white font-['Inter',sans-serif]">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center">
        <Link
          to="/admin/dashboard"
          className="text-[#0F766E] text-sm font-medium hover:underline"
        >
          &larr; {t('admin.backToDashboard')}
        </Link>
      </header>

      <div className="max-w-[560px] mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          {t('header.accountSettings')}
        </h1>

        <form
          onSubmit={handleSubmit}
          className="bg-[#FAFAFA] border border-gray-200 rounded-xl p-6 flex flex-col gap-5"
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">
              {t('label.name')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">
                {t('label.email')}
              </label>
              <span className="text-xs font-medium text-[#6B7280] bg-gray-200 px-2 py-0.5 rounded">
                {t('admin.readOnly')}
              </span>
            </div>
            <input
              type="email"
              value={email}
              readOnly
              className="h-11 rounded-lg border border-gray-200 bg-[#F3F4F6] px-3 text-sm text-[#6B7280]"
            />
          </div>

          <hr className="border-gray-200" />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">
              {t('admin.currentPassword')}
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">
              {t('admin.newPassword')}
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">
              {t('admin.confirmPassword')}
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}
          {success && <p className="text-green-600 text-sm">{success}</p>}

          <button
            type="submit"
            disabled={loading}
            className="h-11 bg-[#0F766E] hover:bg-[#0d6b63] text-white text-[15px] font-semibold rounded-lg disabled:opacity-50 transition-colors"
          >
            {loading ? t('common.saving') : t('admin.saveChanges')}
          </button>
        </form>
      </div>
    </div>
  )
}
