import { describe, it, expect } from 'vitest'
import { averageRating, isEntryLocked } from '@/lib/behaviour'

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
