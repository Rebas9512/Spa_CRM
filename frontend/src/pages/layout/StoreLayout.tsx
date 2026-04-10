import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'

function useAdminAutoExit() {
  const location = useLocation()
  const { accessLevel, setAccessLevel } = useAppStore()
  const prevPathname = useRef(location.pathname)

  useEffect(() => {
    const wasManage = prevPathname.current.includes('/manage')
    const isManage = location.pathname.includes('/manage')
    prevPathname.current = location.pathname

    // Only auto-exit when navigating AWAY from /manage/* pages
    if (accessLevel === 'admin' && wasManage && !isManage) {
      setAccessLevel('staff')
    }
  }, [location.pathname, accessLevel, setAccessLevel])
}

export default function StoreLayout() {
  useAdminAutoExit()

  // store-join is handled by PinPage to avoid duplicate race conditions
  return <Outlet />
}
