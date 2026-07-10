import { describe, it, expect } from 'vitest'
import {
  statusOnOpen,
  statusOnReply,
  averageRating,
  ratingDistribution,
  averageByCategory,
  responseRate,
  CATEGORY_KEYS,
} from '@/lib/feedback'

// Seam 1 (issue #38): unread/read/answered state machine for the Feedback
// Inbox. Opening a message reads it; replying always answers it.
describe('Feedback Inbox status state machine', () => {
  it('opening an unread message marks it read', () => {
    expect(statusOnOpen('unread')).toBe('read')
  })

  it('opening an already-read message is a no-op', () => {
    expect(statusOnOpen('read')).toBe('read')
  })

  it('opening an already-answered message does not downgrade it', () => {
    expect(statusOnOpen('answered')).toBe('answered')
  })

  it('replying answers an unread message directly (implicit read + answered)', () => {
    expect(statusOnReply('unread')).toBe('answered')
  })

  it('replying to a read message answers it', () => {
    expect(statusOnReply('read')).toBe('answered')
  })

  it('re-replying to an already-answered message stays answered', () => {
    expect(statusOnReply('answered')).toBe('answered')
  })
})

// Seam 2: rating aggregation math for the Ratings Dashboard — pure functions,
// no DB required, so every edge case is cheap to pin down.
describe('averageRating', () => {
  it('returns null for no ratings', () => {
    expect(averageRating([])).toBeNull()
  })

  it('averages to one decimal place', () => {
    expect(averageRating([5, 5, 4])).toBe(4.7)
  })

  it('handles a single rating', () => {
    expect(averageRating([3])).toBe(3)
  })
})

describe('ratingDistribution', () => {
  it('returns 0-count, 0-pct buckets for every star when there are no ratings', () => {
    const buckets = ratingDistribution([])
    expect(buckets).toEqual([
      { star: 5, count: 0, pct: 0 },
      { star: 4, count: 0, pct: 0 },
      { star: 3, count: 0, pct: 0 },
      { star: 2, count: 0, pct: 0 },
      { star: 1, count: 0, pct: 0 },
    ])
  })

  it('buckets counts and percentages per star, highest first', () => {
    // 7 ratings: four 5s, two 4s, one 1 — mirrors the mockup's descending layout.
    const buckets = ratingDistribution([5, 5, 5, 5, 4, 4, 1])
    expect(buckets.map((b) => b.star)).toEqual([5, 4, 3, 2, 1])
    expect(buckets[0]).toEqual({ star: 5, count: 4, pct: 57 })
    expect(buckets[1]).toEqual({ star: 4, count: 2, pct: 29 })
    expect(buckets[4]).toEqual({ star: 1, count: 1, pct: 14 })
  })
})

describe('averageByCategory', () => {
  it('averages each category independently, ignoring nulls', () => {
    const rows = [
      { teaching: 5, facilities: 4, communication: null, safety: 5 },
      { teaching: 3, facilities: null, communication: 4, safety: 5 },
    ]
    expect(averageByCategory(rows)).toEqual({
      teaching: 4,
      facilities: 4,
      communication: 4,
      safety: 5,
    })
  })

  it('reports null for a category nobody rated', () => {
    const rows = [{ teaching: 5, facilities: null, communication: null, safety: null }]
    const result = averageByCategory(rows)
    expect(result.facilities).toBeNull()
    expect(result.communication).toBeNull()
    expect(result.safety).toBeNull()
  })

  it('covers exactly the four PRD §5.9 categories', () => {
    expect(CATEGORY_KEYS).toEqual(['teaching', 'facilities', 'communication', 'safety'])
  })
})

describe('responseRate', () => {
  it('is 0 when there are no inbox messages', () => {
    expect(responseRate(0, 0)).toBe(0)
  })

  it('rounds to the nearest whole percent', () => {
    expect(responseRate(3, 2)).toBe(67)
  })

  it('is 100 when every message has been answered', () => {
    expect(responseRate(5, 5)).toBe(100)
  })
})
