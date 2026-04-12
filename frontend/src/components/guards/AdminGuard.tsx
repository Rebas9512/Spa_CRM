import { type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAppStore } from '../../store/appStore'
import { apiFetch } from '../../lib/apiClient'

export default function AdminGuard({ children }: { children: ReactNode }) {
  const { adminSession, setAdminSession } = useAppStore()

  const verify = useQuery({
    queryKey: ['admin-verify', adminSession?.token],
    queryFn: () => apiFetch<{ admin: { id: string } }>('/api/admin/me'),
    enabled: !!adminSession,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  if (!adminSession) {
    return <Navigate to="/admin/login" />
  }

  if (verify.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#0F766E] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (verify.isError) {
    setAdminSession(null)
    return <Navigate to="/admin/login" />
  }

  return <>{children}</>
}
