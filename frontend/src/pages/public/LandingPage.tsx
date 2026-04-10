import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import { useTranslation } from '../../i18n'
import StoreIdInput from '../../components/StoreIdInput'

export default function LandingPage() {
  const navigate = useNavigate()
  const setBoundStoreId = useAppStore((s) => s.setBoundStoreId)
  const { t } = useTranslation()

  const handleSync = (storeId: string, _storeName: string) => {
    setBoundStoreId(storeId)
    navigate(`/s/${storeId}/pin`)
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center font-['Inter',sans-serif]">
      <div className="flex flex-col items-center gap-8 p-6 max-w-3xl w-full">
        {/* Title + Subtitle */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">Foot Spa</h1>
          <p className="text-gray-400 text-sm mt-2">Device &amp; Store Management</p>
        </div>

        <div className="flex flex-col md:flex-row gap-8 w-full">
        {/* Left card: Sync Device */}
        <div className="flex-1 bg-white border border-gray-200 rounded-2xl p-8 shadow-sm flex flex-col gap-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {t('landing.syncDevice')}
            </h2>
            <p className="text-gray-500 text-sm mt-1">
              {t('landing.syncDescription')}
            </p>
          </div>
          <StoreIdInput onSync={handleSync} />
        </div>

        {/* Right card: Admin Portal */}
        <div className="flex-1 bg-white border border-gray-200 rounded-2xl p-8 shadow-sm flex flex-col gap-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {t('landing.adminPortal')}
            </h2>
            <p className="text-gray-500 text-sm mt-1">
              {t('landing.adminDescription')}
            </p>
          </div>
          <div className="flex flex-col gap-3 mt-auto">
            <button
              onClick={() => navigate('/admin/login')}
              className="w-full py-3 bg-[#0F766E] text-white font-medium rounded-lg hover:bg-[#0d6b63] transition-colors"
            >
              {t('landing.loginButton')}
            </button>
            <button
              onClick={() => navigate('/admin/register')}
              className="w-full py-3 bg-white text-[#0F766E] font-medium rounded-lg border border-[#0F766E] hover:bg-gray-50 transition-colors"
            >
              {t('landing.registerButton')}
            </button>
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}
