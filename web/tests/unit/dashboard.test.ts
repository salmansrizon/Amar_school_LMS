import { describe, it, expect } from 'vitest'
import { attendanceRate, mergeActivity, isSubscriptionActive } from '@/lib/dashboard'

describe('attendanceRate', () => {
  it('returns a 1-dp percentage', () => {
    expect(attendanceRate(24, 26)).toBe(92.3)
    expect(attendanceRate(26, 26)).toBe(100)
    expect(attendanceRate(0, 26)).toBe(0)
  })
  it('returns 0 with an empty roster (no divide-by-zero)', () => {
    expect(attendanceRate(0, 0)).toBe(0)
    expect(attendanceRate(5, 0)).toBe(0)
  })
})

describe('mergeActivity', () => {
  const sources = {
    students: [{ full_name: 'Aminul', created_at: '2026-07-10T09:00:00Z' }],
    notices: [{ title: 'Sports Day', created_at: '2026-07-12T08:00:00Z' }],
    feedback: [{ subject: 'Bus route', created_at: '2026-07-11T07:00:00Z' }],
  }

  it('merges all three streams newest-first', () => {
    const out = mergeActivity(sources)
    expect(out.map((i) => i.type)).toEqual(['notice', 'feedback', 'admission'])
    expect(out[0].title).toBe('Sports Day')
  })

  it('caps at the requested limit', () => {
    expect(mergeActivity(sources, 2)).toHaveLength(2)
  })

  it('drops entries without a timestamp', () => {
    const out = mergeActivity({ students: [{ full_name: 'X', created_at: '' }], notices: [], feedback: [] })
    expect(out).toHaveLength(0)
  })
})

describe('isSubscriptionActive', () => {
  const today = new Date('2026-07-13T10:00:00Z')
  it('treats a null expiry as active', () => {
    expect(isSubscriptionActive(null, today)).toBe(true)
  })
  it('is active on/after today, expired before', () => {
    expect(isSubscriptionActive('2026-12-31', today)).toBe(true)
    expect(isSubscriptionActive('2026-07-13', today)).toBe(true)
    expect(isSubscriptionActive('2026-07-12', today)).toBe(false)
  })
})
