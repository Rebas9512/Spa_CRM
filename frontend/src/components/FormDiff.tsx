import type { ReactNode } from 'react'

interface FormDiffProps {
  changed: boolean
  children: ReactNode
}

export default function FormDiff({ changed, children }: FormDiffProps) {
  return (
    <div
      className={`rounded-md px-3 py-2 transition-colors ${
        changed ? 'border' : ''
      }`}
      style={
        changed
          ? { backgroundColor: '#FEF9C3', borderColor: '#FBBF24' }
          : undefined
      }
    >
      {children}
    </div>
  )
}
