import { describe, it, expect } from 'vitest'
import {
  employeeDayStatus,
  buildEmployeeMonthCalendar,
  summarizeEmployeeMonth,
  buildLeaveCalendarMonth,
  buildSchoolAttendanceMonth,
  shiftYearMonth,
  parseMonthParam,
  formatMonthYear,
} from '@/lib/employee-attendance-calendar'

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
