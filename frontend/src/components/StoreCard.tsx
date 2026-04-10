import { useTranslation } from '../i18n'

interface StoreCardProps {
  store: {
    id: string
    name: string
    address?: string | null
    visitsToday: number
  }
  onEnter: () => void
}

export default function StoreCard({ store, onEnter }: StoreCardProps) {
  const { t } = useTranslation()

  return (
    <div className="bg-[#FAFAFA] border border-gray-200 rounded-xl p-6 flex items-center justify-between">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold text-gray-900">{store.name}</h3>
        <p className="text-xs font-mono text-[#9CA3AF] select-all">{t('admin.storeIdLabel')}: {store.id}</p>
        {store.address && (
          <p className="text-sm text-[#6B7280]">{store.address}</p>
        )}
        <div className="flex items-center gap-1.5 mt-1">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
          <span className="text-sm text-[#0F766E]">
            {store.visitsToday} {t('admin.visitsToday')}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={onEnter}
          className="px-4 py-2 bg-[#0F766E] hover:bg-[#0d6b63] text-white text-sm font-semibold rounded-lg transition-colors"
        >
          {t('admin.enterStore')} &rarr;
        </button>
      </div>
    </div>
  )
}
