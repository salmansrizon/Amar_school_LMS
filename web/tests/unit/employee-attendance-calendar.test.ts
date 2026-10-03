import { describe, it, expect } from 'vitest'
import {
  employeeDayStatus,
  employeeTrackingStart,
  buildEmployeeMonthCalendar,
  summarizeEmployeeMonth,
  buildLeaveCalendarMonth,
  buildSchoolAttendanceMonth,
  shiftYearMonth,
  parseMonthParam,
  formatMonthYear,
  withAdjacentMonthDays,
  isWeekendColumn,
  localizeNumber,
  formatDayLong,
} from '@/lib/employee-attendance-calendar'
import type { CalendarCell } from '@/lib/attendance-manual'

const NO_WEEKLY_OFF: number[] = []

describe('employeeDayStatus', () => {
  it('reads present when a record exists, even on an off-day or an approved-leave day', () => {
    expect(employeeDayStatus({ iso: '2026-09-05', today: '2026-09-10', isOff: true, onApprovedLeave: true, hasRecord: true })).toBe(
      'present',
    )
  })
  it('reads future for a day after today with no record', () => {
    expect(employeeDayStatus({ iso: '2026-09-20', today: '2026-09-10', isOff: false, onApprovedLeave: false, hasRecord: false })).toBe(
      'future',
    )
  })
  it('reads off before on_leave when both are true and there is no record', () => {
    expect(employeeDayStatus({ iso: '2026-09-05', today: '2026-09-10', isOff: true, onApprovedLeave: true, hasRecord: false })).toBe(
      'off',
    )
  })
  it('reads on_leave for an approved leave day that is not an off-day', () => {
    expect(employeeDayStatus({ iso: '2026-09-05', today: '2026-09-10', isOff: false, onApprovedLeave: true, hasRecord: false })).toBe(
      'on_leave',
    )
  })
  it('reads absent for a past working day with nothing recorded', () => {
    expect(employeeDayStatus({ iso: '2026-09-05', today: '2026-09-10', isOff: false, onApprovedLeave: false, hasRecord: false })).toBe(
      'absent',
    )
  })
})

describe('buildEmployeeMonthCalendar', () => {
  it('carries entry/exit times only for present days', () => {
    const cells = buildEmployeeMonthCalendar({
      year: 2026,
      month0: 8, // September (0-based)
      today: '2026-09-10',
      offDays: [],
      weeklyOffDays: NO_WEEKLY_OFF,
      records: [{ att_date: '2026-09-05', entry_at: '2026-09-05T02:00:00Z', exit_at: '2026-09-05T10:00:00Z' }],
      approvedLeaves: [],
    })
    const day5 = cells.find((c) => c.iso === '2026-09-05')
    expect(day5).toMatchObject({ status: 'present', entry: '2026-09-05T02:00:00Z', exit: '2026-09-05T10:00:00Z' })
    const day6 = cells.find((c) => c.iso === '2026-09-06')
    expect(day6).toMatchObject({ status: 'absent', entry: null, exit: null })
  })

  it('marks a day inside an approved leave range as on_leave', () => {
    const cells = buildEmployeeMonthCalendar({
      year: 2026,
      month0: 8,
      today: '2026-09-10',
      offDays: [],
      weeklyOffDays: NO_WEEKLY_OFF,
      records: [],
      approvedLeaves: [{ from_day: '2026-09-03', to_day: '2026-09-04' }],
    })
    expect(cells.find((c) => c.iso === '2026-09-03')?.status).toBe('on_leave')
    expect(cells.find((c) => c.iso === '2026-09-04')?.status).toBe('on_leave')
    expect(cells.find((c) => c.iso === '2026-09-02')?.status).toBe('absent')
  })
})

describe('summarizeEmployeeMonth', () => {
  it('rates present over present+absent, excluding leave/off/future days', () => {
    const summary = summarizeEmployeeMonth([
      { day: 1, iso: '2026-09-01', isOff: false, isSignificant: false, label: null, status: 'present', entry: 'x', exit: null },
      { day: 2, iso: '2026-09-02', isOff: false, isSignificant: false, label: null, status: 'absent', entry: null, exit: null },
      { day: 3, iso: '2026-09-03', isOff: false, isSignificant: false, label: null, status: 'on_leave', entry: null, exit: null },
      { day: 4, iso: '2026-09-04', isOff: true, isSignificant: false, label: null, status: 'off', entry: null, exit: null },
      { day: 5, iso: '2026-09-05', isOff: false, isSignificant: false, label: null, status: 'future', entry: null, exit: null },
    ])
    expect(summary).toEqual({ presentDays: 1, absentDays: 1, leaveDays: 1, rate: 50, band: 'atRisk' })
  })

  it('returns a null rate (not 0) with no working days yet', () => {
    expect(summarizeEmployeeMonth([]).rate).toBeNull()
  })
})

describe('buildLeaveCalendarMonth', () => {
  it('buckets a day\'s leaves by status', () => {
    const cells = buildLeaveCalendarMonth({
      year: 2026,
      month0: 8,
      offDays: [{ day: '2026-09-07', label: 'Eid', is_significant: true }],
      weeklyOffDays: NO_WEEKLY_OFF,
      leaves: [
        { employee_name: 'Abdul Karim', from_day: '2026-09-05', to_day: '2026-09-06', status: 'approved' },
        { employee_name: 'Rahim Uddin', from_day: '2026-09-06', to_day: '2026-09-06', status: 'pending' },
      ],
    })
    const day5 = cells.find((c) => c.iso === '2026-09-05')!
    expect(day5.approved).toEqual([{ name: 'Abdul Karim' }])
    expect(day5.pending).toEqual([])
    const day6 = cells.find((c) => c.iso === '2026-09-06')!
    expect(day6.approved).toEqual([{ name: 'Abdul Karim' }])
    expect(day6.pending).toEqual([{ name: 'Rahim Uddin' }])
    const day7 = cells.find((c) => c.iso === '2026-09-07')!
    expect(day7.isOff).toBe(true)
    expect(day7.label).toBe('Eid')
    expect(day7.hasOffDayRow).toBe(true)
  })

  it('tells a day off only by the Weekly Off-Day rule apart from one with an explicit off_days row', () => {
    const cells = buildLeaveCalendarMonth({
      year: 2026,
      month0: 8,
      offDays: [{ day: '2026-09-07', label: 'Eid', is_significant: true }],
      weeklyOffDays: [5], // Friday — 2026-09-04 and 2026-09-11 are Fridays, no explicit row
      leaves: [],
    })
    const weeklyOnly = cells.find((c) => c.iso === '2026-09-04')!
    expect(weeklyOnly.isOff).toBe(true)
    expect(weeklyOnly.hasOffDayRow).toBe(false)
    const explicitRow = cells.find((c) => c.iso === '2026-09-07')!
    expect(explicitRow.isOff).toBe(true)
    expect(explicitRow.hasOffDayRow).toBe(true)
  })
})

describe('buildSchoolAttendanceMonth', () => {
  const employees = [
    { id: 'e1', full_name: 'Abdul Karim' },
    { id: 'e2', full_name: 'Rahim Uddin' },
  ]

  it('computes present/total and a rate for a past working day', () => {
    const cells = buildSchoolAttendanceMonth({
      year: 2026,
      month0: 8,
      today: '2026-09-10',
      offDays: [],
      weeklyOffDays: NO_WEEKLY_OFF,
      employees,
      records: [{ person_id: 'e1', att_date: '2026-09-05', entry_at: '2026-09-05T02:00:00Z' }],
      approvedLeaves: [{ employee_id: 'e2', from_day: '2026-09-05', to_day: '2026-09-05' }],
    })
    const day5 = cells.find((c) => c.iso === '2026-09-05')!
    expect(day5.presentCount).toBe(1)
    expect(day5.totalCount).toBe(2)
    expect(day5.rate).toBe(50)
    expect(day5.employees).toEqual([
      { name: 'Abdul Karim', status: 'present', entry: '2026-09-05T02:00:00Z' },
      { name: 'Rahim Uddin', status: 'on_leave', entry: null },
    ])
  })

  it('leaves the rate null for an off-day and for a future day', () => {
    const cells = buildSchoolAttendanceMonth({
      year: 2026,
      month0: 8,
      today: '2026-09-10',
      offDays: [{ day: '2026-09-04', label: null, is_significant: false }],
      weeklyOffDays: NO_WEEKLY_OFF,
      employees,
      records: [],
      approvedLeaves: [],
    })
    expect(cells.find((c) => c.iso === '2026-09-04')?.rate).toBeNull() // off-day
    expect(cells.find((c) => c.iso === '2026-09-20')?.rate).toBeNull() // future
    expect(cells.find((c) => c.iso === '2026-09-20')?.isFuture).toBe(true)
  })
})

describe('shiftYearMonth', () => {
  it('advances a month within the same year', () => {
    expect(shiftYearMonth('2026-09', 1)).toBe('2026-10')
  })
  it('wraps forward into the next year', () => {
    expect(shiftYearMonth('2026-12', 1)).toBe('2027-01')
  })
  it('wraps backward into the previous year', () => {
    expect(shiftYearMonth('2026-01', -1)).toBe('2025-12')
  })
})

describe('parseMonthParam', () => {
  it('uses a well-formed param', () => {
    expect(parseMonthParam('2026-03', '2026-09-10')).toEqual({ year: 2026, month0: 2 })
  })
  it('falls back to the current month for a missing/malformed param', () => {
    expect(parseMonthParam(undefined, '2026-09-10')).toEqual({ year: 2026, month0: 8 })
    expect(parseMonthParam('not-a-month', '2026-09-10')).toEqual({ year: 2026, month0: 8 })
  })
})

describe('formatMonthYear', () => {
  it('renders an English month/year label', () => {
    expect(formatMonthYear(2026, 8, 'en')).toBe('September 2026')
  })
})

describe('withAdjacentMonthDays', () => {
  function cell(day: number | null, iso: string | null): CalendarCell {
    return { day, iso, isOff: false, isSignificant: false, label: null }
  }

  it('fills leading blanks with the previous month\'s trailing day numbers', () => {
    // 3 leading blanks + 7 real days (Sep 1..7) — daysInPrevMonth(Sep) = Aug 31.
    const cells: CalendarCell[] = [
      cell(null, null),
      cell(null, null),
      cell(null, null),
      ...[1, 2, 3, 4, 5, 6, 7].map((d) => cell(d, `2026-09-0${d}`)),
    ]
    const result = withAdjacentMonthDays(cells, 2026, 8, () => ({}))
    expect(result[0]).toMatchObject({ day: 29, iso: null })
    expect(result[1]).toMatchObject({ day: 30, iso: null })
    expect(result[2]).toMatchObject({ day: 31, iso: null })
    expect(result[3]).toMatchObject({ day: 1, iso: '2026-09-01' })
  })

  it('pads the ragged last row out to a full week with the next month\'s leading days', () => {
    const cells: CalendarCell[] = [
      cell(null, null),
      cell(null, null),
      cell(null, null),
      ...[1, 2, 3, 4, 5, 6, 7].map((d) => cell(d, `2026-09-0${d}`)),
    ]
    const result = withAdjacentMonthDays(cells, 2026, 8, () => ({}))
    // 10 cells in, padded up to the next multiple of 7 -> 14.
    expect(result).toHaveLength(14)
    const trailing = result.slice(10)
    expect(trailing.map((c) => c.day)).toEqual([1, 2, 3, 4])
    expect(trailing.every((c) => c.iso === null)).toBe(true)
  })

  it('leaves an already week-aligned grid untouched', () => {
    const cells: CalendarCell[] = [1, 2, 3, 4, 5, 6, 7].map((d) => cell(d, `2026-09-0${d}`))
    const result = withAdjacentMonthDays(cells, 2026, 8, () => ({}))
    expect(result).toHaveLength(7)
    expect(result[0]).toMatchObject({ day: 1, iso: '2026-09-01' })
  })

  it('merges the blank() extra fields onto trailing cells', () => {
    // Mirrors buildEmployeeMonthCalendar's own blank() — a cell type with
    // fields beyond CalendarCell, filled in on the padding cells too.
    interface TaggedCell extends CalendarCell {
      tag: string | null
    }
    const cells: TaggedCell[] = [{ ...cell(1, '2026-09-01'), tag: 'present' }]
    const result = withAdjacentMonthDays<TaggedCell>(cells, 2026, 8, () => ({ tag: null }))
    expect(result).toHaveLength(7)
    expect(result[1]).toMatchObject({ iso: null, tag: null })
  })
})

describe('isWeekendColumn', () => {
  it('matches a column index against the weekly off-days list', () => {
    expect(isWeekendColumn(5, [5])).toBe(true)
    expect(isWeekendColumn(0, [5])).toBe(false)
  })
  it('wraps the column index mod 7', () => {
    expect(isWeekendColumn(12, [5])).toBe(true) // 12 % 7 = 5
  })
  it('is false when the school has no weekly off-day configured', () => {
    expect(isWeekendColumn(0, [])).toBe(false)
  })
})

describe('localizeNumber', () => {
  it('renders Bangla digits for lang=bn', () => {
    expect(localizeNumber(29, 'bn')).toBe('২৯')
  })
  it('renders Arabic digits for lang=en', () => {
    expect(localizeNumber(29, 'en')).toBe('29')
  })
})

describe('formatDayLong', () => {
  it('spells the day out in English', () => {
    expect(formatDayLong('2026-10-06', 'en')).toBe('October 6, 2026')
  })
  it('uses Bangla digits and month names for lang=bn', () => {
    const s = formatDayLong('2026-10-06', 'bn')
    expect(s).toContain('অক্টোবর')
    expect(s).toContain('২০২৬')
    expect(s).not.toMatch(/[0-9]/)
  })
})

describe('employee tracking start (no absent before joining)', () => {
  const base = { today: '2026-10-03', isOff: false, onApprovedLeave: false, hasRecord: false }

  it('a working day before startDay is not_started, not absent', () => {
    expect(employeeDayStatus({ ...base, iso: '2026-10-01', startDay: '2026-10-03' })).toBe('not_started')
    expect(employeeDayStatus({ ...base, iso: '2026-10-03', startDay: '2026-10-03' })).toBe('absent')
  })

  it('a record before startDay still reads present; a future day stays future', () => {
    expect(employeeDayStatus({ ...base, iso: '2026-10-01', startDay: '2026-10-03', hasRecord: true })).toBe('present')
    expect(employeeDayStatus({ ...base, iso: '2026-10-09', startDay: '2026-10-03' })).toBe('future')
  })

  it('employeeTrackingStart takes the later of joining date and entry day', () => {
    expect(employeeTrackingStart('2020-01-01', '2026-10-03T03:00:00Z')).toBe('2026-10-03')
    expect(employeeTrackingStart('2026-11-01', '2026-10-03T03:00:00Z')).toBe('2026-11-01')
    expect(employeeTrackingStart(null, '2026-10-03T03:00:00Z')).toBe('2026-10-03')
    expect(employeeTrackingStart('2026-10-05', null)).toBe('2026-10-05')
    expect(employeeTrackingStart(null, null)).toBeNull()
  })

  it('the month calendar leaves pre-start days out of the absent count', () => {
    const cells = buildEmployeeMonthCalendar({
      year: 2026,
      month0: 9,
      today: '2026-10-03',
      offDays: [],
      weeklyOffDays: NO_WEEKLY_OFF,
      records: [],
      approvedLeaves: [],
      startDay: '2026-10-02',
    })
    expect(summarizeEmployeeMonth(cells).absentDays).toBe(2) // Oct 2 and 3 only
    expect(cells.find((c) => c.iso === '2026-10-01')?.status).toBe('not_started')
  })

  it('the school calendar drops a not-yet-started employee from the day headcount', () => {
    const cells = buildSchoolAttendanceMonth({
      year: 2026,
      month0: 9,
      today: '2026-10-03',
      offDays: [],
      weeklyOffDays: NO_WEEKLY_OFF,
      employees: [
        { id: 'old', full_name: 'Old' },
        { id: 'new', full_name: 'New', startDay: '2026-10-03' },
      ],
      records: [],
      approvedLeaves: [],
    })
    const oct1 = cells.find((c) => c.iso === '2026-10-01')!
    const oct3 = cells.find((c) => c.iso === '2026-10-03')!
    expect(oct1.totalCount).toBe(1)
    expect(oct3.totalCount).toBe(2)
  })
})
