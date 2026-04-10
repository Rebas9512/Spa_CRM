import { type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'

export default function AdminGuard({ children }: { children: ReactNode }) {
  const { adminSession } = useAppStore()

  if (!adminSession) {
    return <Navigate to="/admin/login" />
  }

  return <>{children}</>
}
