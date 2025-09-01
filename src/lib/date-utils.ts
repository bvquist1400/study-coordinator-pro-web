// Simple UTC-safe date helpers for date-only strings (YYYY-MM-DD)

export function parseDateUTC(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null
  // Ensure we parse as UTC midnight
  // Append T00:00:00Z if only a date is provided
  const iso = /T/.test(dateStr) ? dateStr : `${dateStr}T00:00:00Z`
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d
}

export function daysDiffUTC(a: string | Date, b: string | Date): number {
  const da = a instanceof Date ? a : parseDateUTC(a)
  const db = b instanceof Date ? b : parseDateUTC(b)
  if (!da || !db) return 0
  // Difference in whole days
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

