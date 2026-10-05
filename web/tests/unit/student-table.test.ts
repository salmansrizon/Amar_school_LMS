import { describe, expect, it } from 'vitest'
import { leaveDays, matchesQ, pageOf, taskStateMatches } from '@/lib/student/table'

describe('student table helpers', () => {
  it('matchesQ is case-insensitive, trims, and empty matches all', () => {
    expect(matchesQ('', 'x')).toBe(true)
    expect(matchesQ(undefined, null)).toBe(true)
    expect(matchesQ(' MATH ', 'Algebra', 'math test')).toBe(true)
    expect(matchesQ('zzz', 'Algebra', null)).toBe(false)
  })
  it('pageOf clamps page and honours ?size', () => {
    const rows = Array.from({ length: 25 }, (_, i) => i)
    expect(pageOf(rows, {}).items).toHaveLength(10)
    expect(pageOf(rows, { page: '99' }).page).toBe(3)
    expect(pageOf(rows, { size: '20', page: '2' }).items).toHaveLength(5)
    expect(pageOf(rows, { size: '7' }).pageSize).toBe(10)
  })
  it('leaveDays counts both ends and never goes below one', () => {
    expect(leaveDays('2026-10-05', '2026-10-05')).toBe(1)
    expect(leaveDays('2026-10-05', '2026-10-07')).toBe(3)
    expect(leaveDays('2026-10-30', '2026-11-02')).toBe(4)
    expect(leaveDays('2026-10-07', '2026-10-05')).toBe(1)
  })
  it('taskStateMatches: default is open, all is everything', () => {
    expect(taskStateMatches(undefined, 'later')).toBe(true)
    expect(taskStateMatches(undefined, 'done')).toBe(false)
    expect(taskStateMatches('all', 'done')).toBe(true)
    expect(taskStateMatches('overdue', 'overdue')).toBe(true)
    expect(taskStateMatches('overdue', 'later')).toBe(false)
  })
})
