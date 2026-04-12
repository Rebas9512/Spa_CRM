import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { MASSAGE_TYPES } from '@spa-crm/shared'
import { useAppStore } from '../store/appStore'
import { useTranslation } from '../i18n'

interface NewClientPreAssignProps {
  open: boolean
  onClose: () => void
}

export default function NewClientPreAssign({ open, onClose }: NewClientPreAssignProps) {
  const { storeId } = useParams<{ storeId: string }>()
  const navigate = useNavigate()
  const { setPendingAssignment, setAccessLevel } = useAppStore()
  const { t } = useTranslation()

  const [serviceType, setServiceType] = useState<string>(MASSAGE_TYPES[0].value)

  if (!open) return null

  const handleSubmit = () => {
    setPendingAssignment({ serviceType })
    setAccessLevel('customer')
    navigate(`/s/${storeId}/intake/new`)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 w-96 flex flex-col gap-5">
        <h2 className="text-xl font-bold text-gray-900">
          {t('newClient.title')}
        </h2>

        {/* Service Type */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">
            {t('newClient.serviceType')}
          </label>
          <select
            value={serviceType}
            onChange={(e) => setServiceType(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
          >
            {MASSAGE_TYPES.map((mt) => (
              <option key={mt.value} value={mt.value}>
                {mt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-gray-600 font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            className="px-6 py-2.5 bg-[#0F766E] text-white font-medium rounded-lg hover:bg-[#0d6b63] transition-colors"
          >
            {t('newClient.startForm')}
          </button>
        </div>
      </div>
    </div>
  )
}
