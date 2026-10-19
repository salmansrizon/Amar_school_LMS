import { describe, it, expect } from 'vitest'
import { DUE_DATE_MAX_DAYS_AHEAD, dueDateToTimestamp, publicationDueAt } from '@/lib/publishing'
import { addDays } from '@/lib/school-time'
import { bucketFor } from '@/lib/student/tasks'
import { schoolDay, taskUrgency } from '@/lib/student/dashboard'

// Homework due date (#705): the form sends a school day, the action stores the
// last second of that day in Asia/Dhaka, the student portal reads it back.

const TODAY = '2026-10-05'

describe('dueDateToTimestamp', () => {
  it('stores the last second of the day in Asia/Dhaka', () => {
    expect(dueDateToTimestamp('2026-10-05', TODAY)).toEqual({ dueAt: '2026-10-05T23:59:59+06:00' })
    // 23:59:59 +06:00 is 17:59:59 UTC the same day, and reads back as the same school day.
    expect(new Date('2026-10-05T23:59:59+06:00').toISOString()).toBe('2026-10-05T17:59:59.000Z')
    expect(schoolDay('2026-10-05T23:59:59+06:00')).toBe('2026-10-05')
  })

  it('empty, null and undefined mean no due date', () => {
    for (const v of ['', '   ', null, undefined]) expect(dueDateToTimestamp(v, TODAY)).toEqual({ dueAt: null })
  })

  it('refuses a malformed or impossible date', () => {
    for (const v of ['05/10/2026', '2026-10-5', '2026-13-01', '2026-02-31', '2026-10-05T10:00', 'tomorrow']) {
      expect(dueDateToTimestamp(v, TODAY)).toEqual({ error: 'invalid' })
    }
  })

  it('allows a past date: homework that was already due can be recorded', () => {
    expect(dueDateToTimestamp('2026-10-04', TODAY)).toEqual({ dueAt: '2026-10-04T23:59:59+06:00' })
    expect(dueDateToTimestamp('2025-01-01', TODAY)).toEqual({ dueAt: '2025-01-01T23:59:59+06:00' })
  })

  it('refuses a date absurdly far away, and accepts the last allowed day', () => {
    const last = addDays(TODAY, DUE_DATE_MAX_DAYS_AHEAD)
    expect(dueDateToTimestamp(last, TODAY)).toEqual({ dueAt: `${last}T23:59:59+06:00` })
    expect(dueDateToTimestamp(addDays(last, 1), TODAY)).toEqual({ error: 'too-far' })
    expect(dueDateToTimestamp('2062-10-05', TODAY)).toEqual({ error: 'too-far' })
  })
})

describe('publicationDueAt: what the action writes to publications.due_at', () => {
  it('homework with a date stores it', () => {
    expect(publicationDueAt('homework', '2026-10-06', TODAY)).toEqual({ dueAt: '2026-10-06T23:59:59+06:00' })
  })

  it('homework without a date stores null — which is also how an edit clears one', () => {
    expect(publicationDueAt('homework', null, TODAY)).toEqual({ dueAt: null })
    expect(publicationDueAt('homework', '', TODAY)).toEqual({ dueAt: null })
  })

  it('a caller that does not mention a date leaves the column out of the write', () => {
    expect(publicationDueAt('homework', undefined, TODAY)).toEqual({ dueAt: undefined })
  })

  it('every other kind stores null, whatever was sent', () => {
    for (const kind of ['notice', 'lesson_plan', 'daily_lesson', 'exam_prep'] as const) {
      expect(publicationDueAt(kind, '2026-10-06', TODAY)).toEqual({ dueAt: null })
      expect(publicationDueAt(kind, 'not a date', TODAY)).toEqual({ dueAt: null })
      expect(publicationDueAt(kind, undefined, TODAY)).toEqual({ dueAt: null })
    }
  })

  it('a malformed homework date is an error, not a silent null', () => {
    expect(publicationDueAt('homework', '2026-02-31', TODAY)).toEqual({ error: 'invalid' })
  })
})

describe('day boundary: homework due "today" as the student sees it', () => {
  const stored = dueDateToTimestamp(TODAY, TODAY)
  const task = {
    id: 't',
    title: 't',
    content: null,
    created_at: '2026-10-01T00:00:00Z',
    completed_at: null,
    due_at: 'dueAt' in stored ? stored.dueAt : null,
  }
  // 23:30 and 00:30 Dhaka time, either side of midnight.
  const lateEvening = new Date('2026-10-05T23:30:00+06:00')
  const afterMidnight = new Date('2026-10-06T00:30:00+06:00')

  it('at 23:30 it is still due soon, on the home and on the tasks page', () => {
    expect(taskUrgency(task, schoolDay(lateEvening))).toBe('dueSoon')
    expect(bucketFor(task, lateEvening)).toBe('dueSoon')
  })

  it('at 00:30 the next day it is overdue on both', () => {
    expect(taskUrgency(task, schoolDay(afterMidnight))).toBe('overdue')
    expect(bucketFor(task, afterMidnight)).toBe('overdue')
  })

  it('00:30 Dhaka time on the due day itself is due soon, though UTC still says yesterday', () => {
    const earlyMorning = new Date('2026-10-05T00:30:00+06:00')
    expect(earlyMorning.toISOString().slice(0, 10)).toBe('2026-10-04')
    expect(taskUrgency(task, schoolDay(earlyMorning))).toBe('dueSoon')
    expect(bucketFor(task, earlyMorning)).toBe('dueSoon')
  })
})
