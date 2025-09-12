// Simple UTC-safe date helpers for date-only strings (YYYY-MM-DD)

// Parse a date-only string as UTC midnight, or pass through a Date
export function parseDateUTC(dateStr: string | Date | null | undefined): Date | null {
  if (!dateStr) return null
  if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? null : dateStr
  // Append Z to ensure UTC and avoid local TZ shifting
  const iso = /T/.test(dateStr) ? dateStr : `${dateStr}T00:00:00Z`
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d
}

// Format a date-only or datetime string consistently, without TZ-related day shifts
export function formatDateUTC(
  value: string | Date | null | undefined,
  locale: string | undefined = 'en-US',
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
): string {
  if (!value) return ''
  // If it's a pure date like YYYY-MM-DD, format using UTC to keep the same calendar day
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = parseDateUTC(value)!
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(d)
  }
  // If it's an ISO string at UTC midnight, treat it as date-only and format in UTC
  if (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T00:00:00(\.\d{3})?Z$/.test(value)
  ) {
    const d = new Date(value)
    if (!isNaN(d.getTime())) {
      return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(d)
    }
  }
  const d = value instanceof Date ? value : new Date(value)
  if (isNaN(d.getTime())) return ''
  // If this Date represents a date-only value at UTC midnight, format in UTC
  // to avoid local timezone shifting it to the previous/next day.
  if (
    value instanceof Date &&
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  ) {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(d)
  }
  return new Intl.DateTimeFormat(locale, options).format(d)
}

// Format a datetime including time, keeping date-only strings stable by using UTC
export function formatDateTimeUTC(
  value: string | Date | null | undefined,
  locale: string | undefined = 'en-US',
  options: Intl.DateTimeFormatOptions = {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  }
): string {
  if (!value) return ''
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = parseDateUTC(value)!
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(d)
  }
  const d = value instanceof Date ? value : new Date(value)
  if (isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(locale, options).format(d)
}

// Return today as a local date string (YYYY-MM-DD) for <input type="date"> values
export function todayLocalISODate(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Difference in whole days between two date-only or datetime values (UTC-based for date-only)
export function daysDiffUTC(a: string | Date, b: string | Date): number {
  const da = a instanceof Date ? a : parseDateUTC(a)
  const db = b instanceof Date ? b : parseDateUTC(b)
  if (!da || !db) return 0
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.floor((db.getTime() - da.getTime()) / msPerDay)
}

export function isBeforeUTC(a: string | Date, b: string | Date): boolean {
  const da = a instanceof Date ? a : parseDateUTC(a)
  const db = b instanceof Date ? b : parseDateUTC(b)
  if (!da || !db) return false
  return da.getTime() < db.getTime()
}

export function isAfterUTC(a: string | Date, b: string | Date): boolean {
  const da = a instanceof Date ? a : parseDateUTC(a)
  const db = b instanceof Date ? b : parseDateUTC(b)
  if (!da || !db) return false
  return da.getTime() > db.getTime()
}

// Parse a date-only string into a local Date at local midnight (avoids UTC shift when needed)
export function parseDateLocal(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const d = new Date(dateStr)
    return isNaN(d.getTime()) ? null : d
  }
  const [y, m, d] = dateStr.split('-').map(Number)
  const local = new Date(y, (m as number) - 1, d)
  return isNaN(local.getTime()) ? null : local
}

// Format date as MM/DD/YYYY
export function formatDateUSShort(
  value: string | Date | null | undefined
): string {
  if (!value) return ''
  
  // Handle date-only strings (YYYY-MM-DD) by treating them as UTC
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = parseDateUTC(value)
    if (!d) return ''
    return new Intl.DateTimeFormat('en-US', { 
      month: '2-digit', 
      day: '2-digit', 
      year: 'numeric',
      timeZone: 'UTC'
    }).format(d)
  }
  
  const d = value instanceof Date ? value : new Date(value)
  if (isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', { 
    month: '2-digit', 
    day: '2-digit', 
    year: 'numeric'
  }).format(d)
}
