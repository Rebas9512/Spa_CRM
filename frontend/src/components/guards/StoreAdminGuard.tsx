import { type ReactNode } from 'react'
import { Navigate, useParams, useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import PinPrompt from '../PinPrompt'

export default function StoreAdminGuard({ children }: { children: ReactNode }) {
  const { storeSession, accessLevel } = useAppStore()
  const { storeId } = useParams()
  const navigate = useNavigate()

  if (!storeSession) {
    return <Navigate to={`/s/${storeId}/pin`} />
  }

  if (accessLevel !== 'admin') {
    return (
      <PinPrompt
        requiredRole="store_admin"
        onCancel={() => navigate(`/s/${storeId}/`)}
      />
    )
  }

  return <>{children}</>
}
