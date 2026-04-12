import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AccessLevel = 'customer' | 'staff' | 'admin'

export interface StoreSession {
  token: string
  storeId: string
  role: 'staff' | 'store_admin'
  sessionId: string
  sessionStartAt: string
}

interface AppState {
  boundStoreId: string | null
  setBoundStoreId: (v: string | null) => void

  adminSession: { token: string; adminId: string } | null
  setAdminSession: (s: AppState['adminSession']) => void

  storeSession: StoreSession | null
  setStoreSession: (s: StoreSession | null) => void

  accessLevel: AccessLevel
  setAccessLevel: (v: AccessLevel) => void

  pendingAssignment: { serviceType: string } | null
  setPendingAssignment: (v: AppState['pendingAssignment']) => void

  returnAfterPin: string | null
  setReturnAfterPin: (v: string | null) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      boundStoreId: null,
      setBoundStoreId: (v) => set({ boundStoreId: v }),

      adminSession: null,
      setAdminSession: (s) => set({ adminSession: s }),

      storeSession: null,
      setStoreSession: (s) => set({ storeSession: s }),

      accessLevel: 'staff',
      setAccessLevel: (v) => set({ accessLevel: v }),

      pendingAssignment: null,
      setPendingAssignment: (v) => set({ pendingAssignment: v }),

      returnAfterPin: null,
      setReturnAfterPin: (v) => set({ returnAfterPin: v }),
    }),
    {
      name: 'spa-crm-store',
      partialize: (state) => ({
        boundStoreId: state.boundStoreId,
        adminSession: state.adminSession,
        storeSession: state.storeSession,
        accessLevel: state.accessLevel,
      }),
    },
  ),
)
