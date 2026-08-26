import { describe, it, expect } from 'vitest'
import { responseReport, median, withinRange, type MessageForStats } from '@/lib/student/response-performance'

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
