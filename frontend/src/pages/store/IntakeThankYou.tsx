import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import PinPrompt from '../../components/PinPrompt'

export default function IntakeThankYou() {
  const { storeId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const setReturnAfterPin = useAppStore((s) => s.setReturnAfterPin)
  const setAccessLevel = useAppStore((s) => s.setAccessLevel)
  const firstName = (location.state as { firstName?: string } | null)?.firstName ?? 'Guest'

  const [showPin, setShowPin] = useState(false)

  useEffect(() => {
    setReturnAfterPin('/s/' + storeId + '/customers')
    return () => setReturnAfterPin(null)
  }, [setReturnAfterPin, storeId])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center space-y-8">
        {/* Green checkmark */}
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
            <svg
              className="w-10 h-10 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        </div>

        {/* Message */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">
            Thank you, {firstName}!
          </h1>
          <p className="text-gray-500 text-base">
            Your form has been submitted successfully.
          </p>
        </div>

        {/* Next Client button */}
        <button
          type="button"
          onClick={() => navigate(`/s/${storeId}/intake/new`)}
          className="w-full px-6 py-3 rounded-lg bg-primary text-white text-base font-medium active:opacity-80"
        >
          Next Client
        </button>

        {/* Divider */}
        <div className="flex items-center gap-4">
          <div className="flex-1 border-t border-gray-300" />
          <span className="text-sm text-gray-400">or</span>
          <div className="flex-1 border-t border-gray-300" />
        </div>

        {/* Return to Staff button */}
        <button
          type="button"
          onClick={() => setShowPin(true)}
          className="w-full px-6 py-3 rounded-lg border-2 border-gray-300 text-gray-700 text-base font-medium active:bg-gray-100"
        >
          Return to Staff
        </button>

        <p className="text-gray-400 text-sm">
          Please return the iPad to our staff.
        </p>
      </div>

      {showPin && (
        <PinPrompt
          onSuccess={() => {
            setShowPin(false)
            setAccessLevel('staff')
            navigate(`/s/${storeId}/`)
          }}
          onCancel={() => setShowPin(false)}
        />
      )}
    </div>
  )
}
