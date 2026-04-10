import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { apiFetch } from '../../lib/apiClient'
import { useAppStore } from '../../store/appStore'
import { useTranslation } from '../../i18n'

export default function AdminLogin() {
  const navigate = useNavigate()
  const setAdminSession = useAppStore((s) => s.setAdminSession)
  const { t } = useTranslation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const data = await apiFetch<{ token: string; adminId: string; name: string }>(
        '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        },
      )
      setAdminSession({ token: data.token, adminId: data.adminId })
      navigate('/admin/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.invalidCredentials'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center font-['Inter',sans-serif]">
      <div className="w-full max-w-[400px] bg-[#FAFAFA] border border-[#E5E7EB] rounded-xl p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          {t('admin.login')}
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="email"
            placeholder={t('label.email')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
          />
          <input
            type="password"
            placeholder={t('admin.password')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
          />

          {error && (
            <p className="text-red-500 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="h-11 bg-[#0F766E] hover:bg-[#0d6b63] text-white text-[15px] font-semibold rounded-lg disabled:opacity-50 transition-colors"
          >
            {loading ? t('common.loading') : t('btn.login')}
          </button>
        </form>

        <p className="text-sm text-center mt-4 text-[#6B7280]">
          {t('admin.noAccount')}{' '}
          <Link to="/admin/register" className="text-[#0F766E] font-medium hover:underline">
            {t('btn.register')}
          </Link>
        </p>
      </div>
    </div>
  )
}
