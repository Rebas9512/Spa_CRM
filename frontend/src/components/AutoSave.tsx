import { useEffect, useRef } from 'react'

interface AutoSaveProps {
  formKey: string
  data: unknown
  onRestore?: (data: unknown) => void
}

const DRAFT_PREFIX = 'spa-crm-draft-'

export function clearDraft(key: string) {
  try {
    localStorage.removeItem(DRAFT_PREFIX + key)
  } catch {
    // ignore
  }
}

export default function AutoSave({ formKey, data, onRestore }: AutoSaveProps) {
  const restoredRef = useRef(false)

  // Restore on mount
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true

    try {
      const saved = localStorage.getItem(DRAFT_PREFIX + formKey)
      if (saved && onRestore) {
        onRestore(JSON.parse(saved))
      }
    } catch {
      // ignore
    }
  }, [formKey, onRestore])

  // Debounced save
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_PREFIX + formKey, JSON.stringify(data))
      } catch {
        // ignore
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [formKey, data])

  return null
}
