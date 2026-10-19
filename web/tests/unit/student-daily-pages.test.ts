import { describe, expect, it } from 'vitest'
import { attendanceRange, groupQuestions, orderLeaves, taskPiles } from '@/lib/student/daily'
import type { StudentTask } from '@/lib/student/tasks'

const task = (id: string, o: Partial<StudentTask> = {}): StudentTask => ({
  id, title: id, content: null, due_at: null, created_at: '2026-09-01T00:00:00Z', completed_at: null, ...o,
})

describe('attendanceRange', () => {
  it('current month ends today', () => {
    expect(attendanceRange('2026-10-01', '2026-10-31', '2026-10-04')).toEqual({ start: '2026-10-01', end: '2026-10-04' })
  })
  it('past month keeps its last day', () => {
    expect(attendanceRange('2026-09-01', '2026-09-30', '2026-10-04')).toEqual({ start: '2026-09-01', end: '2026-09-30' })
  })
  it('last day of the month is the month end', () => {
    expect(attendanceRange('2026-10-01', '2026-10-31', '2026-10-31')?.end).toBe('2026-10-31')
  })
  it('future month has nothing to count', () => {
    expect(attendanceRange('2026-11-01', '2026-11-30', '2026-10-04')).toBeNull()
  })
})

describe('taskPiles', () => {
  const today = '2026-10-04'
  it('places by school day and counts a hand-in as done', () => {
    const p = taskPiles(
      [
        task('late', { due_at: '2026-10-03T10:00:00Z' }),
        task('soon', { due_at: '2026-10-06T10:00:00Z' }),
        task('far', { due_at: '2026-10-20T10:00:00Z' }),
        task('undated'),
        task('ticked', { completed_at: '2026-10-01T00:00:00Z', due_at: '2026-10-02T00:00:00Z' }),
        task('handed', { submitted: true, due_at: '2026-10-02T00:00:00Z' }),
      ],
      today,
    )
    expect(p.overdue.map((t) => t.id)).toEqual(['late'])
    expect(p.dueSoon.map((t) => t.id)).toEqual(['soon'])
    expect(p.later.map((t) => t.id)).toEqual(['far', 'undated'])
    expect(p.done.map((t) => t.id).sort()).toEqual(['handed', 'ticked'])
  })
  it('orders overdue soonest first', () => {
    const p = taskPiles([task('b', { due_at: '2026-10-02T00:00:00Z' }), task('a', { due_at: '2026-10-01T00:00:00Z' })], today)
    expect(p.overdue.map((t) => t.id)).toEqual(['a', 'b'])
  })
})

describe('orderLeaves', () => {
  it('pending first, then newest', () => {
    const rows = [
      { id: 'old-ok', status: 'approved', created_at: '2026-09-01' },
      { id: 'new-no', status: 'rejected', created_at: '2026-10-02' },
      { id: 'pend-old', status: 'pending', created_at: '2026-09-20' },
      { id: 'pend-new', status: 'pending', created_at: '2026-10-01' },
    ]
    expect(orderLeaves(rows).map((r) => r.id)).toEqual(['pend-new', 'pend-old', 'new-no', 'old-ok'])
  })
})

describe('groupQuestions', () => {
  it('splits by isAnswered (status or replied_at)', () => {
    const g = groupQuestions([
      { id: 1, status: 'unread' as const, replied_at: null, created_at: '2026-10-01' },
      { id: 2, status: 'answered' as const, replied_at: null, created_at: '2026-10-02' },
      { id: 3, status: 'read' as const, replied_at: '2026-10-03', created_at: '2026-10-03' },
      { id: 4, status: 'read' as const, replied_at: null, created_at: '2026-10-04' },
    ])
    expect(g.waiting.map((q) => q.id)).toEqual([4, 1])
    expect(g.answered.map((q) => q.id)).toEqual([3, 2])
  })
})
