import { describe, it, expect } from 'vitest'
import { attendanceBand, attendanceRate, mergeActivity, isSubscriptionActive, unmarkedOfferings, buildDashAlerts, attendanceToday } from '@/lib/dashboard'

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

describe('unmarkedOfferings', () => {
  it('lists placed classes with nobody marked', () => {
    const students = [
      { id: 's1', offeringId: 'A' },
      { id: 's2', offeringId: 'A' },
      { id: 's3', offeringId: 'B' },
      { id: 's4', offeringId: null },
    ]
    expect(unmarkedOfferings(students, new Set(['s2']))).toEqual(['B'])
    expect(unmarkedOfferings(students, new Set(['s4']))).toEqual(['A', 'B'])
  })
})

describe('buildDashAlerts', () => {
  const zero = {
    approvals: 0,
    corrections: 0,
    questions: 0,
    unmarkedClasses: 0,
    sms: null,
    canAttendance: true,
    canSms: true,
  }
  it('is empty when nothing needs attention', () => {
    expect(buildDashAlerts(zero)).toEqual([])
    expect(buildDashAlerts({ ...zero, sms: { balance: 500, level: 'ok' } })).toEqual([])
  })
  it('emits one alert per non-zero count, each with its fixing page', () => {
    const out = buildDashAlerts({
      ...zero,
      approvals: 2,
      corrections: 1,
      unmarkedClasses: 3,
      sms: { balance: 0, level: 'empty' },
    })
    expect(out.map((a) => [a.kind, a.count, a.href])).toEqual([
      ['approvals', 2, '/school/approvals'],
      ['corrections', 1, '/school/corrections'],
      ['attendance', 3, '/school/attendance/mark'],
      ['sms', 0, '/school/sms/buy'],
    ])
  })
  it('drops alerts the caller cannot act on', () => {
    expect(
      buildDashAlerts({
        ...zero,
        unmarkedClasses: 3,
        sms: { balance: 5, level: 'low' },
        canAttendance: false,
        canSms: false,
      }),
    ).toEqual([])
  })
})

describe('attendanceBand', () => {
  it('bands at 90 and 75, inclusive on the upper band', () => {
    expect(attendanceBand(100)).toBe('regular')
    expect(attendanceBand(90)).toBe('regular')
    expect(attendanceBand(89.9)).toBe('irregular')
    expect(attendanceBand(75)).toBe('irregular')
    expect(attendanceBand(74.9)).toBe('atRisk')
    expect(attendanceBand(0)).toBe('atRisk')
  })
})

// Audit F2: the dashboard rate must divide by classes that were marked, not by
// every student in the school.
describe('attendanceToday', () => {
  const students = [
    { id: 'a1', offeringId: 'A' },
    { id: 'a2', offeringId: 'A' },
    { id: 'b1', offeringId: 'B' },
    { id: 'b2', offeringId: 'B' },
    { id: 'u1', offeringId: null },
  ]

  it('rates only classes where attendance was taken, and counts the rest as not yet marked', () => {
    // Class A taken: a1 present, a2 absent (note). Class B untouched.
    const r = attendanceToday(students, new Set(['a1']), new Set(['a1', 'a2']))
    expect(r).toEqual({ present: 1, total: 2, classesTaken: 1, classesPlaced: 2, rate: 50 })
  })

  it('has no rate (not 0%) while nothing is marked', () => {
    const r = attendanceToday(students, new Set(), new Set())
    expect(r.rate).toBeNull()
    expect(r.classesPlaced).toBe(2)
    expect(r.classesTaken).toBe(0)
  })

  it('ignores unplaced students and counts every class when all are taken', () => {
    const r = attendanceToday(students, new Set(['a1', 'a2', 'b1', 'u1']), new Set(['a1', 'a2', 'b1', 'u1']))
    expect(r).toEqual({ present: 3, total: 4, classesTaken: 2, classesPlaced: 2, rate: 75 })
  })
})
