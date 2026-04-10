import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { apiFetch } from '../../lib/apiClient'
import { useTranslation } from '../../i18n'

export default function AdminRegister() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [inviteCode, setInviteCode] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError(t('admin.passwordMismatch'))
      return
    }

    setLoading(true)
    try {
      await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ inviteCode, email, password, name }),
      })
      navigate('/admin/login')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.registerFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center font-['Inter',sans-serif]">
      <div className="w-full max-w-[400px] bg-[#FAFAFA] border border-[#E5E7EB] rounded-xl p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          {t('admin.createAccount')}
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="text"
            placeholder={t('admin.inviteCode')}
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            required
            className="h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
          />
          <input
            type="text"
            placeholder={t('label.name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
          />
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
          <input
            type="password"
            placeholder={t('admin.confirmPassword')}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
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
            {loading ? t('common.loading') : t('btn.register')}
          </button>
        </form>

        <p className="text-sm text-center mt-4 text-[#6B7280]">
          {t('admin.hasAccount')}{' '}
          <Link to="/admin/login" className="text-[#0F766E] font-medium hover:underline">
            {t('btn.login')}
          </Link>
        </p>
      </div>
    </div>
  )
}
