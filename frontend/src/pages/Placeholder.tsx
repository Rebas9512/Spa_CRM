import { useLocation } from 'react-router-dom'

export default function Placeholder() {
  const { pathname } = useLocation()

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center space-y-2">
        <p className="text-lg font-medium text-gray-700">Coming Soon</p>
        <p className="text-sm text-gray-400 font-mono">{pathname}</p>
      </div>
    </div>
  )
}
