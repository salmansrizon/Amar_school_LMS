import { describe, it, expect } from 'vitest'
import {
  monthGrid,
  dateRangeDays,
  registerDayStatus,
  studentLogDayStatus,
  attendancePercent,
} from '@/lib/attendance-manual'

// filterRoster's cases moved with it to tests/unit/school-roster.test.ts.
// mergeLeaves/filterLeaves cases removed with the functions themselves (map
// #664, the old combined Leave Management page) — Student/Employee Leave
// Management now query and render each table independently.

describe('monthGrid', () => {
  it('leads with blank cells to align the first weekday', () => {
    // 2026-07-01 is a Wednesday -> 3 leading blanks (Sun, Mon, Tue)
    const grid = monthGrid(2026, 6, [])
    expect(grid.slice(0, 3)).toEqual([
      { day: null, iso: null, isOff: false, isSignificant: false, label: null },
      { day: null, iso: null, isOff: false, isSignificant: false, label: null },
      { day: null, iso: null, isOff: false, isSignificant: false, label: null },
    ])
    expect(grid[3]).toMatchObject({ day: 1, iso: '2026-07-01' })
  })

  it('shades every Saturday as off even without an off_days row', () => {
    const grid = monthGrid(2026, 6, [])
    const saturday = grid.find((c) => c.iso === '2026-07-04')
    expect(saturday?.isOff).toBe(true)
    expect(saturday?.isSignificant).toBe(false)
  })

  it('marks an explicit significant off-day from the table', () => {
    const grid = monthGrid(2026, 6, [{ day: '2026-07-05', label: 'Special day', is_significant: true }])
    const cell = grid.find((c) => c.iso === '2026-07-05')
    expect(cell).toMatchObject({ isOff: true, isSignificant: true, label: 'Special day' })
  })

  it('has the correct day count for the month', () => {
    const grid = monthGrid(2026, 1, []) // Feb 2026 (not a leap year) = 28 days
    const realDays = grid.filter((c) => c.day !== null)
    expect(realDays).toHaveLength(28)
  })
})

// Student Log Custom filter (map #380): flat [from, to] day list.
describe('dateRangeDays', () => {
  it('lists every ISO date in the range inclusive, shading Saturdays off', () => {
    const days = dateRangeDays('2026-07-01', '2026-07-04', [])
    expect(days.map((d) => d.iso)).toEqual(['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04'])
    expect(days.find((d) => d.iso === '2026-07-04')?.isOff).toBe(true) // Saturday
    expect(days.find((d) => d.iso === '2026-07-01')?.isOff).toBe(false)
  })

  it('a single-day range (from === to) returns that one day', () => {
    expect(dateRangeDays('2026-07-01', '2026-07-01', []).map((d) => d.iso)).toEqual(['2026-07-01'])
  })

  it('a reversed range (from > to) is empty, not a crash', () => {
    expect(dateRangeDays('2026-07-10', '2026-07-01', [])).toEqual([])
  })

  it('a missing bound is empty', () => {
    expect(dateRangeDays('', '2026-07-10', [])).toEqual([])
    expect(dateRangeDays('2026-07-01', '', [])).toEqual([])
  })

  it('an explicit off_days row marks a non-Saturday off too', () => {
    const days = dateRangeDays('2026-07-05', '2026-07-06', [{ day: '2026-07-05', label: 'Eid', is_significant: true }])
    expect(days.find((d) => d.iso === '2026-07-05')?.isOff).toBe(true)
    expect(days.find((d) => d.iso === '2026-07-06')?.isOff).toBe(false)
  })

  it('caps at a year of days rather than hanging on a huge range', () => {
    expect(dateRangeDays('2020-01-01', '2030-01-01', [])).toHaveLength(366)
  })
})

// Attendance Book (issue #30): monthly register cell status.
describe('registerDayStatus', () => {
  const today = '2026-07-15'

  it('a day with a record is present, regardless of anything else', () => {
    expect(
      registerDayStatus({ iso: '2026-07-05', today, isOff: true, onApprovedLeave: true, hasRecord: true }),
    ).toBe('present')
  })

  it('a future day stays blank even with no record', () => {
    expect(
      registerDayStatus({ iso: '2026-07-20', today, isOff: false, onApprovedLeave: false, hasRecord: false }),
    ).toBe('blank')
  })

  it('an off-day with no record stays blank, not absent', () => {
    expect(
      registerDayStatus({ iso: '2026-07-04', today, isOff: true, onApprovedLeave: false, hasRecord: false }),
    ).toBe('blank')
  })

  it('an approved-leave day with no record stays blank, not absent', () => {
    expect(
      registerDayStatus({ iso: '2026-07-06', today, isOff: false, onApprovedLeave: true, hasRecord: false }),
    ).toBe('blank')
  })

  it('a past working day with no record and no excuse is absent', () => {
    expect(
      registerDayStatus({ iso: '2026-07-10', today, isOff: false, onApprovedLeave: false, hasRecord: false }),
    ).toBe('absent')
  })

  it('today itself with no record and no excuse is absent (day already happened)', () => {
    expect(
      registerDayStatus({ iso: today, today, isOff: false, onApprovedLeave: false, hasRecord: false }),
    ).toBe('absent')
  })
})

// Student Log (map #380): same signals as registerDayStatus, but off-day and
// approved-leave stay told apart instead of collapsing to 'blank'.
describe('studentLogDayStatus', () => {
  const today = '2026-07-15'

  it('a day with a record is present, regardless of anything else', () => {
    expect(
      studentLogDayStatus({ iso: '2026-07-05', today, isOff: true, onApprovedLeave: true, hasRecord: true }),
    ).toBe('present')
  })

  it('a future day is null, not a status', () => {
    expect(
      studentLogDayStatus({ iso: '2026-07-20', today, isOff: false, onApprovedLeave: false, hasRecord: false }),
    ).toBeNull()
  })

  it('an off-day with no record is holiday', () => {
    expect(
      studentLogDayStatus({ iso: '2026-07-04', today, isOff: true, onApprovedLeave: false, hasRecord: false }),
    ).toBe('holiday')
  })

  it('an approved-leave day with no record is on_leave', () => {
    expect(
      studentLogDayStatus({ iso: '2026-07-06', today, isOff: false, onApprovedLeave: true, hasRecord: false }),
    ).toBe('on_leave')
  })

  it('off-day wins over approved leave when both are true (school is closed either way)', () => {
    expect(
      studentLogDayStatus({ iso: '2026-07-04', today, isOff: true, onApprovedLeave: true, hasRecord: false }),
    ).toBe('holiday')
  })

  it('a past working day with no record and no excuse is absent', () => {
    expect(
      studentLogDayStatus({ iso: '2026-07-10', today, isOff: false, onApprovedLeave: false, hasRecord: false }),
    ).toBe('absent')
  })

  it('today itself with no record and no excuse is absent (day already happened)', () => {
    expect(
      studentLogDayStatus({ iso: today, today, isOff: false, onApprovedLeave: false, hasRecord: false }),
    ).toBe('absent')
  })
})

describe('attendancePercent: present days over working days, not raw row count (issue #33)', () => {
  it('all present is 100%', () => {
    expect(attendancePercent(20, 0)).toBe(100)
  })

  it('divides present by (present + genuinely absent working days)', () => {
    expect(attendancePercent(96, 4)).toBe(96)
  })

  it('rounds to the nearest whole percent', () => {
    expect(attendancePercent(2, 1)).toBe(67)
  })

  it('a student with zero working days considered has no percentage (not misleading 0%)', () => {
    expect(attendancePercent(0, 0)).toBeNull()
  })
})
