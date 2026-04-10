import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from '../../i18n'

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'zh', label: '中文' },
]

const TIMEZONE_OPTIONS = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'Pacific/Honolulu',
  'Asia/Shanghai',
  'Asia/Tokyo',
]

const DATE_FORMAT_OPTIONS = [
  'MM/DD/YYYY',
  'DD/MM/YYYY',
  'YYYY-MM-DD',
]

function loadSettings() {
  try {
    const raw = localStorage.getItem('spa-crm-general-settings')
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return {
    language: 'en',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    dateFormat: 'MM/DD/YYYY',
  }
}

export default function GeneralSettings() {
  const { t } = useTranslation()

  const [settings, setSettings] = useState(loadSettings)
  const [saved, setSaved] = useState(false)

  const update = (key: string, value: string) => {
    setSaved(false)
    setSettings((prev: Record<string, string>) => ({ ...prev, [key]: value }))
  }

  const handleSave = () => {
    localStorage.setItem('spa-crm-general-settings', JSON.stringify(settings))
    setSaved(true)
  }

  return (
    <div className="min-h-screen bg-white font-['Inter',sans-serif]">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center">
        <Link
          to="/admin/dashboard"
          className="text-[#0F766E] text-sm font-medium hover:underline"
        >
          &larr; {t('admin.backToDashboard')}
        </Link>
      </header>

      <div className="max-w-[560px] mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          {t('header.generalSettings')}
        </h1>

        <div className="bg-[#FAFAFA] border border-gray-200 rounded-xl p-6">
          {/* Language */}
          <div className="flex items-center justify-between py-4">
            <div>
              <p className="text-sm font-medium text-gray-900">{t('admin.language')}</p>
              <p className="text-xs text-[#6B7280] mt-0.5">{t('admin.languageDesc')}</p>
            </div>
            <select
              value={settings.language}
              onChange={(e) => update('language', e.target.value)}
              className="w-[200px] h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <hr className="border-gray-200" />

          {/* Timezone */}
          <div className="flex items-center justify-between py-4">
            <div>
              <p className="text-sm font-medium text-gray-900">{t('admin.timezone')}</p>
              <p className="text-xs text-[#6B7280] mt-0.5">{t('admin.timezoneDesc')}</p>
            </div>
            <select
              value={settings.timezone}
              onChange={(e) => update('timezone', e.target.value)}
              className="w-[200px] h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
            >
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>

          <hr className="border-gray-200" />

          {/* Date Format */}
          <div className="flex items-center justify-between py-4">
            <div>
              <p className="text-sm font-medium text-gray-900">{t('admin.dateFormat')}</p>
              <p className="text-xs text-[#6B7280] mt-0.5">{t('admin.dateFormatDesc')}</p>
            </div>
            <select
              value={settings.dateFormat}
              onChange={(e) => update('dateFormat', e.target.value)}
              className="w-[200px] h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
            >
              {DATE_FORMAT_OPTIONS.map((fmt) => (
                <option key={fmt} value={fmt}>{fmt}</option>
              ))}
            </select>
          </div>
        </div>

        {saved && (
          <p className="text-green-600 text-sm mt-3">{t('admin.saveSuccess')}</p>
        )}

        <button
          onClick={handleSave}
          className="w-full h-11 mt-4 bg-[#0F766E] hover:bg-[#0d6b63] text-white text-[15px] font-semibold rounded-lg transition-colors"
        >
          {t('admin.saveChanges')}
        </button>
      </div>
    </div>
  )
}
