import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/apiClient'
import { useAppStore } from '../../store/appStore'
import { useTranslation } from '../../i18n'
import StoreCard from '../../components/StoreCard'

const handleEnterStore = (storeId: string, navigate: ReturnType<typeof useNavigate>, setBoundStoreId: (v: string | null) => void) => {
  setBoundStoreId(storeId)
  navigate(`/s/${storeId}/pin`)
}

interface Store {
  id: string
  name: string
  address: string | null
  visitsToday: number
}

export default function AdminDashboard() {
  const navigate = useNavigate()
  const setAdminSession = useAppStore((s) => s.setAdminSession)
  const setBoundStoreId = useAppStore((s) => s.setBoundStoreId)
  const { t } = useTranslation()

  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch<{ stores: Store[] }>('/api/admin/stores')
      .then((data) => setStores(data.stores))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleLogout = () => {
    setAdminSession(null)
    navigate('/landing')
  }

  return (
    <div className="min-h-screen bg-white font-['Inter',sans-serif]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB]">
        <h1 className="text-xl font-bold text-gray-900">
          {t('header.adminDashboard')}
        </h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin/general-settings')}
            className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {t('header.generalSettings')}
          </button>
          <button
            onClick={() => navigate('/admin/account')}
            className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {t('admin.account')}
          </button>
          <button
            onClick={handleLogout}
            className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {t('admin.logout')}
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-6">
        {/* My Stores header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">
            {t('header.myStores')}
          </h2>
          <button
            onClick={() => navigate('/admin/stores/new')}
            className="px-4 py-2 bg-[#0F766E] hover:bg-[#0d6b63] text-white text-sm font-semibold rounded-lg transition-colors"
          >
            + {t('admin.newStore')}
          </button>
        </div>

        {/* Store list */}
        {loading ? (
          <p className="text-sm text-[#6B7280]">{t('common.loading')}</p>
        ) : stores.length === 0 ? (
          <p className="text-sm text-[#6B7280]">{t('admin.noStores')}</p>
        ) : (
          <div className="flex flex-col gap-5">
            {stores.map((store) => (
              <StoreCard
                key={store.id}
                store={store}
                onManage={() => navigate(`/s/${store.id}/manage`)}
                onEnter={() => handleEnterStore(store.id, navigate, setBoundStoreId)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
