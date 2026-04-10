import { type ReactNode } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import PinPrompt from '../PinPrompt'

export default function StaffGuard({ children }: { children: ReactNode }) {
  const { storeSession, accessLevel } = useAppStore()
  const { storeId } = useParams()

  if (!storeSession) {
    return <Navigate to={`/s/${storeId}/pin`} />
  }

  // customer accessLevel → need PIN to return to staff
  if (accessLevel === 'customer') {
    return <PinPrompt />
  }

  // staff and admin both allowed (admin is superset of staff)
  return <>{children}</>
}
