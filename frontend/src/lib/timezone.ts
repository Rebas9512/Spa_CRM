/**
 * Format a UTC datetime string from the database into the user's configured timezone.
 * Reads timezone from localStorage general settings (set in Store Management → General Settings).
 * Falls back to browser timezone if not configured.
 */

function getTimezone(): string {
  try {
    const raw = localStorage.getItem('spa-crm-general-settings')
    if (raw) {
      const settings = JSON.parse(raw)
      if (settings.timezone) return settings.timezone
    }
  } catch { /* ignore */ }
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/**
 * Format a UTC date string (e.g. "2026-04-10 23:37:50") to local display.
 * @param utcStr - UTC datetime string from database
 * @param style - 'datetime' (default), 'date', or 'time'
 */
export function formatLocalTime(
  utcStr: string | null | undefined,
  style: 'datetime' | 'date' | 'time' = 'datetime',
): string {
  if (!utcStr) return '-'

  // DB stores "YYYY-MM-DD HH:MM:SS" without timezone indicator — append Z for UTC
  const normalized = utcStr.includes('T') ? utcStr : utcStr.replace(' ', 'T') + 'Z'
  const date = new Date(normalized)
  if (isNaN(date.getTime())) return utcStr // fallback to raw string if parse fails

  const tz = getTimezone()

  const options: Intl.DateTimeFormatOptions = { timeZone: tz }

  switch (style) {
    case 'date':
      options.year = 'numeric'
      options.month = '2-digit'
      options.day = '2-digit'
      break
    case 'time':
      options.hour = '2-digit'
      options.minute = '2-digit'
      options.hour12 = false
      break
    default: // datetime
      options.year = 'numeric'
      options.month = '2-digit'
      options.day = '2-digit'
      options.hour = '2-digit'
      options.minute = '2-digit'
      options.hour12 = false
      break
  }

  return new Intl.DateTimeFormat('en-CA', options).format(date).replace(',', '')
}
