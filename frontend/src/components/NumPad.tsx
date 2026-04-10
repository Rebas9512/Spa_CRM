import { useCallback } from 'react'

interface NumPadProps {
  value: string
  onChange: (value: string) => void
  onSearch?: () => void
}

function formatPhone(digits: string): string {
  if (digits.length === 0) return ''
  if (digits.length <= 3) return `(${digits}`
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

export default function NumPad({ value, onChange, onSearch }: NumPadProps) {
  const handleDigit = useCallback(
    (d: string) => {
      if (value.length >= 10) return
      onChange(value + d)
    },
    [value, onChange],
  )

  const handleBackspace = useCallback(() => {
    onChange(value.slice(0, -1))
  }, [value, onChange])

  const keys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['back', '0', 'search'],
  ]

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Display */}
      <div className="text-3xl font-medium text-gray-900 h-10 flex items-center">
        {value.length > 0 ? formatPhone(value) : (
          <span className="text-gray-300">( ___ ) ___ - ____</span>
        )}
      </div>

      {/* Keypad */}
      <div className="flex flex-col gap-3">
        {keys.map((row, ri) => (
          <div key={ri} className="flex gap-3">
            {row.map((key) => {
              if (key === 'back') {
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={handleBackspace}
                    className="w-[72px] h-[72px] rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-400 text-xl active:bg-gray-100"
                  >
                    ⌫
                  </button>
                )
              }
              if (key === 'search') {
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={onSearch}
                    disabled={value.length < 10}
                    className="w-[72px] h-[72px] rounded-lg bg-primary text-white flex items-center justify-center text-2xl disabled:opacity-50 active:opacity-80"
                  >
                    🔍
                  </button>
                )
              }
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleDigit(key)}
                  className="w-[72px] h-[72px] rounded-lg bg-gray-50 border border-gray-200 text-gray-900 text-2xl font-medium active:bg-gray-100"
                >
                  {key}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
