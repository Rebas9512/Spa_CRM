import { useAppStore } from '../store/appStore'

export async function apiFetch<T = unknown>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const { storeSession, adminSession } = useAppStore.getState()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  }

  // Use admin token for /api/admin/* routes, store token for everything else
  if (url.startsWith('/api/admin') && adminSession?.token) {
    headers['Authorization'] = `Bearer ${adminSession.token}`
  } else if (storeSession?.token) {
    headers['Authorization'] = `Bearer ${storeSession.token}`
  }

  const res = await fetch(url, { ...options, headers })

  // 410: Store closed (Close Out) — primary session invalidation signal
  if (res.status === 410) {
    const storeId = storeSession?.storeId
    useAppStore.getState().setStoreSession(null)
    useAppStore.getState().setAccessLevel('staff')
    if (storeId) window.location.href = `/s/${storeId}/pin`
    throw new Error('Store closed')
  }

  // 401: JWT invalid — defensive only, Store JWT has no time expiry
  // Skip redirect for auth endpoints (PIN verification, login) where 401 means "wrong credentials"
  if (res.status === 401 && !url.startsWith('/api/auth/')) {
    if (url.startsWith('/api/admin/')) {
      // Admin session expired — let AdminGuard handle /admin/me verification;
      // for other admin endpoints, clear session and redirect
      if (url === '/api/admin/me') {
        throw new Error('Session invalid')
      }
      useAppStore.getState().setAdminSession(null)
      window.location.href = '/admin/login'
    } else {
      const storeId = storeSession?.storeId
      useAppStore.getState().setStoreSession(null)
      useAppStore.getState().setAccessLevel('staff')
      if (storeId) window.location.href = `/s/${storeId}/pin`
    }
    throw new Error('Session invalid')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error || `API error: ${res.status}`)
  }

  return res.json() as Promise<T>
}
