import { formatDateUTC, parseDateUTC, todayLocalISODate } from '@/lib/date-utils'

describe('date-utils', () => {
  test('formatDateUTC formats date-only strings without off-by-one', () => {
    // Should always resolve to Jan 1, 2024 in en-US regardless of local TZ
    const out = formatDateUTC('2024-01-01', 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    expect(out).toBe('Jan 1, 2024')
  })

  test('parseDateUTC returns UTC midnight for date-only', () => {
    const d = parseDateUTC('2024-01-01')!
    expect(d.getUTCFullYear()).toBe(2024)
    expect(d.getUTCMonth()).toBe(0)
    expect(d.getUTCDate()).toBe(1)
    // Local date can vary by TZ, so check UTC components only
  })

  test('todayLocalISODate returns local yyyy-mm-dd', () => {
    const s = todayLocalISODate()
    expect(/^\d{4}-\d{2}-\d{2}$/.test(s)).toBe(true)
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    expect(s).toBe(`${y}-${m}-${d}`)
  })
})

