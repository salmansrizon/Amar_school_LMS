import { describe, it, expect } from 'vitest'
import {
  responseReport,
  median,
  withinRange,
  schoolWideOverall,
  visibleTeacherRows,
  type MessageForStats,
} from '@/lib/student/response-performance'

const NOW = new Date('2026-08-26T12:00:00Z')
const hoursAgo = (n: number) => new Date(NOW.getTime() - n * 3_600_000).toISOString()

const msg = (over: Partial<MessageForStats> & { id: string }): MessageForStats => ({
  created_at: hoursAgo(10),
  replied_at: null,
  teacherId: 't1',
  teacherName: 'Karim Sir',
  subject: over.id,
  ...over,
})

describe('median', () => {
  it('takes the middle of an odd list', () => {
    expect(median([1, 5, 3])).toBe(3)
  })
  it('averages the middle pair of an even list', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })
  it('is null for nothing', () => {
    expect(median([])).toBeNull()
  })
})

describe('responseReport', () => {
  it('counts received, answered and still waiting', () => {
    const report = responseReport(
      [
        msg({ id: 'a', created_at: hoursAgo(10), replied_at: hoursAgo(8) }),
        msg({ id: 'b', created_at: hoursAgo(5) }),
      ],
      NOW,
    )
    expect(report.overall).toMatchObject({ received: 2, answered: 1, unanswered: 1 })
  })

  it('measures reply time from question to reply, not to now', () => {
    const report = responseReport(
      [msg({ id: 'a', created_at: hoursAgo(10), replied_at: hoursAgo(8) })],
      NOW,
    )
    expect(report.overall.medianHours).toBe(2)
    expect(report.overall.slowestHours).toBe(2)
  })

  it('names the oldest question still waiting, and how long', () => {
    const report = responseReport(
      [
        msg({ id: 'recent', created_at: hoursAgo(2) }),
        msg({ id: 'stale', created_at: hoursAgo(72), subject: 'About chapter 4' }),
      ],
      NOW,
    )
    expect(report.overall.oldestWaiting).toEqual({ id: 'stale', subject: 'About chapter 4', hours: 72 })
  })

  it('has no oldest-waiting once everything is answered', () => {
    const report = responseReport(
      [msg({ id: 'a', created_at: hoursAgo(4), replied_at: hoursAgo(1) })],
      NOW,
    )
    expect(report.overall.oldestWaiting).toBeNull()
    expect(report.overall.unanswered).toBe(0)
  })

  it('reports null reply times when nothing has been answered — not zero', () => {
    const report = responseReport([msg({ id: 'a' })], NOW)
    expect(report.overall.medianHours).toBeNull()
    expect(report.overall.slowestHours).toBeNull()
  })

  it('splits per teacher and rolls the school up', () => {
    const report = responseReport(
      [
        msg({ id: 'a', teacherId: 't1', teacherName: 'Karim Sir' }),
        msg({ id: 'b', teacherId: 't2', teacherName: 'Ayesha Miss' }),
        msg({ id: 'c', teacherId: 't2', teacherName: 'Ayesha Miss' }),
      ],
      NOW,
    )
    expect(report.overall.received).toBe(3)
    expect(report.perTeacher.map((t) => t.received)).toEqual([2, 1])
  })

  it('orders teachers by name, never by any metric', () => {
    // Ordering people by response time is the leaderboard this must not be.
    const report = responseReport(
      [
        msg({ id: 'slow', teacherId: 'z', teacherName: 'Zaman Sir', created_at: hoursAgo(100) }),
        msg({ id: 'fast', teacherId: 'a', teacherName: 'Ayesha Miss', replied_at: hoursAgo(9) }),
      ],
      NOW,
    )
    expect(report.perTeacher.map((t) => t.teacherName)).toEqual(['Ayesha Miss', 'Zaman Sir'])
  })

  it('collects questions with no accountable teacher rather than dropping them', () => {
    // A class with no teacher assigned is a normal state (#435), and its
    // questions still need answering.
    const report = responseReport([msg({ id: 'a', teacherId: null, teacherName: null })], NOW)
    expect(report.perTeacher).toHaveLength(1)
    expect(report.perTeacher[0].teacherId).toBeNull()
    expect(report.overall.received).toBe(1)
  })
})

describe('withinRange', () => {
  const rows = [
    msg({ id: 'jan', created_at: '2026-01-15T00:00:00Z' }),
    msg({ id: 'jun', created_at: '2026-06-15T00:00:00Z' }),
  ]

  it('includes both ends of the window', () => {
    expect(withinRange(rows, '2026-01-15', '2026-01-15').map((r) => r.id)).toEqual(['jan'])
  })

  it('treats a missing bound as open', () => {
    expect(withinRange(rows, null, null)).toHaveLength(2)
    expect(withinRange(rows, '2026-02-01', null).map((r) => r.id)).toEqual(['jun'])
  })
})

// The two seams #509 pulled out of the page (ADR 0018): the school-wide Σ a
// teacher is allowed to see, and which per-teacher rows she is allowed to see.

describe('schoolWideOverall', () => {
  it('computes the Σ from timestamps alone', () => {
    // school_question_timings discloses nothing else — no student, no class, no
    // subject — which is what lets a teacher see it at all.
    const stats = schoolWideOverall(
      [
        { created_at: '2026-08-01T00:00:00Z', replied_at: '2026-08-01T04:00:00Z' },
        { created_at: '2026-08-01T00:00:00Z', replied_at: '2026-08-01T10:00:00Z' },
        { created_at: '2026-08-01T00:00:00Z', replied_at: null },
      ],
      new Date('2026-08-02T00:00:00Z'),
    )
    expect(stats.received).toBe(3)
    expect(stats.answered).toBe(2)
    expect(stats.unanswered).toBe(1)
    expect(stats.medianHours).toBe(7)
    expect(stats.slowestHours).toBe(10)
    expect(stats.oldestWaiting?.hours).toBe(24)
  })

  it('agrees with the Owner path on the same questions', () => {
    // One definition of "median". If these two ever diverge, a teacher and her
    // Owner are reading different numbers for the same school.
    const rows = [
      { created_at: '2026-08-01T00:00:00Z', replied_at: '2026-08-01T03:00:00Z' },
      { created_at: '2026-08-01T00:00:00Z', replied_at: '2026-08-01T09:00:00Z' },
    ]
    const viaOwner = responseReport(
      rows.map((r, i) => ({ id: String(i), subject: '', ...r, teacherId: null, teacherName: null })),
      new Date('2026-08-02T00:00:00Z'),
    ).overall
    expect(schoolWideOverall(rows, new Date('2026-08-02T00:00:00Z'))).toEqual(viaOwner)
  })

  it('reports an empty school without inventing a number', () => {
    const stats = schoolWideOverall([])
    expect(stats.received).toBe(0)
    expect(stats.medianHours).toBeNull()
    expect(stats.oldestWaiting).toBeNull()
  })
})

describe('visibleTeacherRows', () => {
  const report = responseReport(
    [
      { id: '1', subject: 'a', created_at: '2026-08-01T00:00:00Z', replied_at: null, teacherId: 'karim', teacherName: 'Karim' },
      { id: '2', subject: 'b', created_at: '2026-08-01T00:00:00Z', replied_at: null, teacherId: 'nusrat', teacherName: 'Nusrat' },
      { id: '3', subject: 'c', created_at: '2026-08-01T00:00:00Z', replied_at: null, teacherId: null, teacherName: null },
    ],
    new Date('2026-08-02T00:00:00Z'),
  )

  it('gives the Owner the full per-teacher table', () => {
    expect(visibleTeacherRows(report, { isOwner: true, employeeId: null })).toHaveLength(3)
  })

  it('gives a teacher her own row and no colleague’s', () => {
    // The league table is exactly what #455 asked this not to become.
    const rows = visibleTeacherRows(report, { isOwner: false, employeeId: 'karim' })
    expect(rows.map((r) => r.teacherId)).toEqual(['karim'])
  })

  it('keeps the unassigned bucket with the Owner', () => {
    // A class with no Class Teacher belongs to nobody; surfacing it on some
    // arbitrary teacher's page would make her look accountable for it.
    const rows = visibleTeacherRows(report, { isOwner: false, employeeId: null })
    expect(rows).toEqual([])
  })
})
