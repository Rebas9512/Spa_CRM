import { useLocation } from 'react-router-dom'
import { zh } from './locales/zh'
import { en } from './locales/en'

export type TranslationKey = keyof typeof zh

const translations = { zh, en } as const

function getSavedLanguage(): 'zh' | 'en' {
  try {
    const raw = localStorage.getItem('spa-crm-general-settings')
    if (raw) {
      const settings = JSON.parse(raw)
      if (settings.language === 'en' || settings.language === 'zh') return settings.language
    }
  } catch { /* ignore */ }
  return 'zh'
}

function getLocale(pathname: string): 'zh' | 'en' {
  // Customer-facing pages are always English
  if (pathname.includes('/intake/') || pathname.endsWith('/checkin')) return 'en'
  // Everything else respects the saved language preference
  return getSavedLanguage()
}

export function useTranslation() {
  let pathname = '/'
  try {
    const location = useLocation()
    pathname = location.pathname
  } catch {
    // Outside router context, use saved preference
  }
  const locale = getLocale(pathname)
  const t = (key: string): string => {
    const dict = translations[locale] as Record<string, string>
    return dict[key] || (translations[locale === 'zh' ? 'en' : 'zh'] as Record<string, string>)[key] || key
  }
  /** Always-English translator for customer-facing UI sections */
  const tEn = (key: string): string => {
    return (translations.en as Record<string, string>)[key] || key
  }
  return { t, tEn, locale }
}
