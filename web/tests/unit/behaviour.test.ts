import { describe, it, expect } from 'vitest'
import { averageRating, isEntryLocked, recentAverage } from '@/lib/behaviour'

describe('isEntryLocked: read-only 3 days after CREATION (issue #7)', () => {
  const now = new Date('2026-07-08T12:00:00Z')

  it('a fresh entry is editable', () => {
    expect(isEntryLocked(new Date('2026-07-08T09:00:00Z'), now)).toBe(false)
  })

  it('locks exactly at the 72-hour mark', () => {
    expect(isEntryLocked(new Date('2026-07-05T12:00:01Z'), now)).toBe(false)
    expect(isEntryLocked(new Date('2026-07-05T12:00:00Z'), now)).toBe(true)
    expect(isEntryLocked(new Date('2026-07-01T00:00:00Z'), now)).toBe(true)
  })
})

describe('averageRating: rolling average across entries', () => {
  it('averages plain ratings', () => {
    expect(averageRating([4, 5, 3])).toBe(4)
  })
  it('rounds to one decimal', () => {
    expect(averageRating([5, 4])).toBe(4.5)
    expect(averageRating([5, 4, 4])).toBe(4.3)
  })
  it('empty log has no average', () => {
    expect(averageRating([])).toBeNull()
  })
})

describe('recentAverage: rolling window (issue #46)', () => {
  const now = new Date('2026-07-08T12:00:00Z')
  const entries = [
    { rating: 8, created_at: '2026-07-07T12:00:00Z' }, // in window
    { rating: 6, created_at: '2026-06-01T12:00:00Z' }, // in 90d window
    { rating: 2, created_at: '2026-01-01T12:00:00Z' }, // outside 90d
  ]

  it('averages only entries within the window', () => {
    expect(recentAverage(entries, now, 90)).toBe(7) // (8+6)/2
  })
  it('a tighter window excludes older entries', () => {
    expect(recentAverage(entries, now, 7)).toBe(8) // only the 07-07 entry
  })
  it('no entries in window → null', () => {
    const old = [{ rating: 5, created_at: '2020-01-01T00:00:00Z' }]
    expect(recentAverage(old, now, 90)).toBeNull()
  })
})
