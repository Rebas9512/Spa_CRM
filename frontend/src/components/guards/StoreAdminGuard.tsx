import { type ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import PinPrompt from '../PinPrompt'

export default function StoreAdminGuard({ children }: { children: ReactNode }) {
  const { storeSession, accessLevel } = useAppStore()
  const { storeId } = useParams()
  const navigate = useNavigate()

  if (!storeSession || accessLevel !== 'admin') {
    return (
      <PinPrompt
        requiredRole="store_admin"
        onCancel={() => navigate(`/s/${storeId}/${storeSession ? '' : 'pin'}`)}
      />
    )
  }

  return <>{children}</>
}
