import { describe, it, expect } from 'vitest'
import { bucketFor, splitTasks, pendingCount, DUE_SOON_DAYS, type StudentTask } from '@/lib/student/tasks'

const NOW = new Date('2026-08-26T10:00:00Z')
const task = (over: Partial<StudentTask> & { id: string }): StudentTask => ({
  title: over.id,
  content: null,
  due_at: null,
  created_at: '2026-08-01T00:00:00Z',
  completed_at: null,
  ...over,
})

const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString()

describe('bucketFor', () => {
  it('marks a passed deadline overdue', () => {
    expect(bucketFor(task({ id: 'a', due_at: inDays(-1) }), NOW)).toBe('overdue')
  })

  it('counts the next week as due soon, and beyond it as later', () => {
    expect(bucketFor(task({ id: 'a', due_at: inDays(1) }), NOW)).toBe('dueSoon')
    expect(bucketFor(task({ id: 'b', due_at: inDays(DUE_SOON_DAYS + 1) }), NOW)).toBe('later')
  })

  it('lets done beat overdue', () => {
    // Finished late is still finished. Showing it in red forever would nag
    // rather than inform.
    const late = task({ id: 'a', due_at: inDays(-3), completed_at: inDays(-1) })
    expect(bucketFor(late, NOW)).toBe('done')
  })

  it('never calls an undated task overdue', () => {
    expect(bucketFor(task({ id: 'a' }), NOW)).toBe('later')
  })
})

describe('splitTasks', () => {
  it('orders each pile by soonest deadline, undated last', () => {
    const buckets = splitTasks(
      [
        task({ id: 'no-date' }),
        task({ id: 'far', due_at: inDays(20) }),
        task({ id: 'near', due_at: inDays(10) }),
      ],
      NOW,
    )
    expect(buckets.later.map((t) => t.id)).toEqual(['near', 'far', 'no-date'])
  })

  it('orders done most-recently-finished first', () => {
    const buckets = splitTasks(
      [
        task({ id: 'older', completed_at: inDays(-5) }),
        task({ id: 'newer', completed_at: inDays(-1) }),
      ],
      NOW,
    )
    expect(buckets.done.map((t) => t.id)).toEqual(['newer', 'older'])
  })
})

describe('pendingCount', () => {
  it('counts what is pressing, not everything outstanding', () => {
    const buckets = splitTasks(
      [
        task({ id: 'overdue', due_at: inDays(-1) }),
        task({ id: 'soon', due_at: inDays(2) }),
        task({ id: 'later', due_at: inDays(30) }),
        task({ id: 'done', completed_at: inDays(-1) }),
      ],
      NOW,
    )
    expect(pendingCount(buckets)).toBe(2)
  })
})
