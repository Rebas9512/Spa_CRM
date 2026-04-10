import React, { Suspense } from 'react'
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ErrorBoundary from './components/ErrorBoundary'
import StoreLayout from './pages/layout/StoreLayout'
import StaffGuard from './components/guards/StaffGuard'
import StoreAdminGuard from './components/guards/StoreAdminGuard'
import AdminGuard from './components/guards/AdminGuard'
import Placeholder from './pages/Placeholder'

// ---------------------------------------------------------------------------
// Lazy page loader — resolves to Placeholder if module doesn't exist yet.
// At runtime Vite will resolve the chunk; if it hasn't been created the
// catch path renders the Placeholder instead.
// ---------------------------------------------------------------------------
type LazyModule = { default: React.ComponentType }

function lazyPage(loader: () => Promise<LazyModule>) {
  return React.lazy(() =>
    loader().catch((): LazyModule => ({ default: Placeholder })),
  )
}

// Public
const LandingPage = lazyPage(() => import('./pages/public/LandingPage'))

// Store — no guard
const PinPage = lazyPage(() => import('./pages/store/PinPage'))

// Store — staff guard
const StaffMain = lazyPage(() => import('./pages/store/StaffMain'))
const CustomerList = lazyPage(() => import('./pages/store/CustomerList'))
const CustomerProfile = lazyPage(() => import('./pages/store/CustomerProfile'))
const ReturnCheckin = lazyPage(() => import('./pages/store/ReturnCheckin'))
const TherapistQueuePage = lazyPage(() => import('./pages/store/TherapistQueuePage'))
const TherapistRecordPage = lazyPage(() => import('./pages/store/TherapistRecordPage'))

// Store — intake (customer territory, no guard)
const IntakeForm = lazyPage(() => import('./pages/store/IntakeForm'))
const IntakeEdit = lazyPage(() => import('./pages/store/IntakeEdit'))
const IntakeThankYou = lazyPage(() => import('./pages/store/IntakeThankYou'))

// Admin — public
const AdminLogin = lazyPage(() => import('./pages/public/AdminLogin'))
const AdminRegister = lazyPage(() => import('./pages/public/AdminRegister'))

// Admin — guarded
const AdminDashboard = lazyPage(() => import('./pages/admin/AdminDashboard'))
const StoreCreate = lazyPage(() => import('./pages/admin/StoreCreate'))
// StoreManage removed — management is via /s/:storeId/manage (StoreManagePage)
const AccountAnalytics = lazyPage(() => import('./pages/admin/AccountAnalytics'))
const AccountSettings = lazyPage(() => import('./pages/admin/AccountSettings'))
const GeneralSettings = lazyPage(() => import('./pages/admin/GeneralSettings'))
const AdminCustomerDetail = lazyPage(() => import('./pages/admin/AdminCustomerDetail'))

// Store — manage (store admin guard) — full page
const StoreManagePage = lazyPage(() => import('./pages/store/StoreManagePage'))

// ---------------------------------------------------------------------------
// Fallback shown while lazy chunks load
// ---------------------------------------------------------------------------
function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Lazy wrapper — Suspense boundary for each lazy route
// ---------------------------------------------------------------------------
function Lazy({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingFallback />}>{children}</Suspense>
    </ErrorBoundary>
  )
}

// ---------------------------------------------------------------------------
// Query client
// ---------------------------------------------------------------------------
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
const router = createBrowserRouter([
  // Root redirect
  { path: '/', element: <Navigate to="/landing" replace /> },

  // Public routes
  {
    path: '/landing',
    element: <Lazy><LandingPage /></Lazy>,
  },
  {
    path: '/admin/login',
    element: <Lazy><AdminLogin /></Lazy>,
  },
  {
    path: '/admin/register',
    element: <Lazy><AdminRegister /></Lazy>,
  },

  // Store routes
  {
    path: '/s/:storeId',
    element: <StoreLayout />,
    children: [
      // PIN page — no guard
      {
        path: 'pin',
        element: <Lazy><PinPage /></Lazy>,
      },

      // Intake — customer territory, no guard
      {
        path: 'intake/new',
        element: <Lazy><IntakeForm /></Lazy>,
      },
      {
        path: 'intake/:customerId/edit',
        element: <Lazy><IntakeEdit /></Lazy>,
      },
      {
        path: 'intake/thankyou',
        element: <Lazy><IntakeThankYou /></Lazy>,
      },

      // Staff-guarded routes
      {
        index: true,
        element: (
          <StaffGuard>
            <Lazy><StaffMain /></Lazy>
          </StaffGuard>
        ),
      },
      {
        path: 'customers',
        element: (
          <StaffGuard>
            <Lazy><CustomerList /></Lazy>
          </StaffGuard>
        ),
      },
      {
        path: 'customer/:id',
        element: (
          <StaffGuard>
            <Lazy><CustomerProfile /></Lazy>
          </StaffGuard>
        ),
      },
      {
        path: 'customer/:id/checkin',
        element: (
          <StaffGuard>
            <Lazy><ReturnCheckin /></Lazy>
          </StaffGuard>
        ),
      },
      {
        path: 'therapist-queue',
        element: (
          <StaffGuard>
            <Lazy><TherapistQueuePage /></Lazy>
          </StaffGuard>
        ),
      },
      {
        path: 'visits/:id/therapist',
        element: (
          <StaffGuard>
            <Lazy><TherapistRecordPage /></Lazy>
          </StaffGuard>
        ),
      },

      // Store admin-guarded routes
      {
        path: 'manage',
        element: (
          <StoreAdminGuard>
            <Lazy><StoreManagePage /></Lazy>
          </StoreAdminGuard>
        ),
      },
      {
        path: 'manage/customers/:id',
        element: (
          <StoreAdminGuard>
            <Lazy><AdminCustomerDetail /></Lazy>
          </StoreAdminGuard>
        ),
      },
      {
        path: 'manage/*',
        element: (
          <StoreAdminGuard>
            <Lazy><Placeholder /></Lazy>
          </StoreAdminGuard>
        ),
      },
    ],
  },

  // Admin routes
  {
    path: '/admin/dashboard',
    element: (
      <AdminGuard>
        <Lazy><AdminDashboard /></Lazy>
      </AdminGuard>
    ),
  },
  {
    path: '/admin/stores/new',
    element: (
      <AdminGuard>
        <Lazy><StoreCreate /></Lazy>
      </AdminGuard>
    ),
  },
  {
    path: '/admin/analytics',
    element: (
      <AdminGuard>
        <Lazy><AccountAnalytics /></Lazy>
      </AdminGuard>
    ),
  },
  {
    path: '/admin/account',
    element: (
      <AdminGuard>
        <Lazy><AccountSettings /></Lazy>
      </AdminGuard>
    ),
  },
  {
    path: '/admin/general-settings',
    element: (
      <AdminGuard>
        <Lazy><GeneralSettings /></Lazy>
      </AdminGuard>
    ),
  },

  // 404 catch-all
  {
    path: '*',
    element: <Navigate to="/landing" replace />,
  },
])

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
// Maintenance mode — set VITE_MAINTENANCE=true to enable
const MAINTENANCE = import.meta.env.VITE_MAINTENANCE === 'true'

function MaintenancePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center font-['Inter',sans-serif]">
      <div className="text-center space-y-4 px-6">
        <div className="text-5xl">🔧</div>
        <h1 className="text-2xl font-bold text-gray-900">System Maintenance</h1>
        <p className="text-gray-500 text-sm max-w-sm">
          We're currently updating the system to bring you new features. Please check back shortly.
        </p>
        <p className="text-gray-400 text-xs">系统正在维护升级中，请稍后再试</p>
      </div>
    </div>
  )
}

export default function App() {
  if (MAINTENANCE) return <MaintenancePage />
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
