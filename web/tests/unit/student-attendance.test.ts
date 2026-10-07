import { describe, it, expect } from 'vitest'
import {
  monthGrid,
  attendancePercent,
  attendanceOutcome,
  monthLeadIn,
  monthRange,
  shiftMonth,
  daysInMonth,
} from '@/lib/student/attendance'
import { classAttendanceDays } from '@/lib/student/attendance-source'
import type { SupabaseClient } from '@supabase/supabase-js'

describe('monthGrid', () => {
  const base = { year: 2026, month: 9, presentDates: [], approvedLeaveRanges: [], offDays: [] }

  it('emits one row per calendar day', () => {
    expect(monthGrid(base)).toHaveLength(30)
  })

  it('lets present beat everything — they were there whatever the calendar said', () => {
    const grid = monthGrid({
      ...base,
      presentDates: ['2026-09-03'],
      offDays: [{ day: '2026-09-03', label: 'Holiday' }],
      approvedLeaveRanges: [{ from_day: '2026-09-01', to_day: '2026-09-30' }],
    })
    expect(grid.find((d) => d.date === '2026-09-03')?.state).toBe('present')
  })

  it('puts approved leave above an off day', () => {
    const grid = monthGrid({
      ...base,
      approvedLeaveRanges: [{ from_day: '2026-09-05', to_day: '2026-09-07' }],
      offDays: [{ day: '2026-09-06', label: 'Holiday' }],
    })
    expect(grid.find((d) => d.date === '2026-09-06')?.state).toBe('leave')
  })

  it('covers a whole leave range, not just its ends', () => {
    const grid = monthGrid({
      ...base,
      approvedLeaveRanges: [{ from_day: '2026-09-05', to_day: '2026-09-07' }],
    })
    for (const d of ['2026-09-05', '2026-09-06', '2026-09-07']) {
      expect(grid.find((x) => x.date === d)?.state, d).toBe('leave')
    }
    expect(grid.find((x) => x.date === '2026-09-08')?.state).toBe('blank')
  })

  it('calls an unmarked day blank, never absent', () => {
    // attendance_records only ever holds present-ish rows, so "no row" cannot
    // mean absent — that is the trap the progress report already hit.
    expect(monthGrid(base).every((d) => d.state === 'blank')).toBe(true)
  })

  it('names the holiday on an off day', () => {
    const grid = monthGrid({ ...base, offDays: [{ day: '2026-09-02', label: 'Eid' }] })
    expect(grid.find((d) => d.date === '2026-09-02')).toMatchObject({ state: 'off', label: 'Eid' })
  })
})

describe('attendancePercent', () => {
  it('is present over working days', () => {
    expect(attendancePercent(18, 2)).toBe(90)
  })

  it('returns null when nothing has been marked — not 0%', () => {
    expect(attendancePercent(0, 0)).toBeNull()
  })

  it('handles a full-absence month honestly', () => {
    expect(attendancePercent(0, 20)).toBe(0)
  })
})

describe('monthLeadIn', () => {
  it('offsets day 1 to its own weekday, Sunday-start', () => {
    // 2026-08-01 is a Saturday: six blanks before it.
    expect(monthLeadIn(2026, 8)).toBe(6)
    // 2026-02-01 is a Sunday: none.
    expect(monthLeadIn(2026, 2)).toBe(0)
  })
})

describe('monthRange / daysInMonth / shiftMonth', () => {
  it('spans the whole month', () => {
    expect(monthRange(2026, 2)).toEqual({ start: '2026-02-01', end: '2026-02-28' })
  })

  it('knows a leap February', () => {
    expect(daysInMonth(2028, 2)).toBe(29)
  })

  it('steps across a year boundary in both directions', () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 })
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 })
  })
})

// Migration 0215 (#703 item 4.4). takenDates is what
// student_class_attendance_days returns; null is "function not there yet".
describe('attendanceOutcome', () => {
  const today = '2026-10-15'
  // What the pages did before 0215, spelled out so the fallback is pinned to it.
  const before = (present: string[], absent: number) => ({
    percent: present.length ? attendancePercent(present.length, absent) : null,
    absentDays: absent,
  })

  it.each([
    { present: ['2026-10-01', '2026-10-04'], absent: 3 },
    { present: [], absent: 9 },
    { present: ['2026-10-01'], absent: 0 },
  ])('function unavailable: identical to before ($present.length present, $absent absent)', ({ present, absent }) => {
    const out = attendanceOutcome({ presentDates: present, takenDates: null, absentWorkingDays: absent, today })
    expect({ percent: out.percent, absentDays: out.absentDays }).toEqual(before(present, absent))
    expect(out.absentDates.size).toBe(0)
  })

  it('an empty answer (an unplaced Student) is also the behaviour from before', () => {
    const present = ['2026-10-01', '2026-10-04']
    const out = attendanceOutcome({ presentDates: present, takenDates: [], absentWorkingDays: 3, today })
    expect({ percent: out.percent, absentDays: out.absentDays }).toEqual(before(present, 3))
    expect(out.absentDates.size).toBe(0)
  })

  it('no day taken and no present row: no percentage, whatever the RPC counted', () => {
    expect(attendanceOutcome({ presentDates: [], takenDates: [], absentWorkingDays: 11, today }).percent).toBeNull()
  })

  it('absent on every taken day reads 0%, not "no data"', () => {
    const taken = ['2026-10-01', '2026-10-04', '2026-10-05']
    const out = attendanceOutcome({ presentDates: [], takenDates: taken, absentWorkingDays: 11, today })
    expect(out.percent).toBe(0)
    expect(out.absentDays).toBe(3)
    expect([...out.absentDates]).toEqual(taken)
  })

  it('mixed: judged on taken days only, not on the RPC count', () => {
    const out = attendanceOutcome({
      presentDates: ['2026-10-01', '2026-10-04'],
      takenDates: ['2026-10-01', '2026-10-04', '2026-10-05'],
      // Days nobody marked still count here; they no longer reach the percent.
      absentWorkingDays: 8,
      today,
    })
    expect(out.percent).toBe(67)
    expect(out.absentDays).toBe(1)
    expect([...out.absentDates]).toEqual(['2026-10-05'])
  })

  it('a taken day after today is not an absence', () => {
    const out = attendanceOutcome({
      presentDates: ['2026-10-01'],
      takenDates: ['2026-10-01', '2026-10-16'],
      absentWorkingDays: 0,
      today,
    })
    expect(out.percent).toBe(100)
    expect(out.absentDates.size).toBe(0)
  })
})

describe('classAttendanceDays', () => {
  const client = (reply: { data: unknown; error: unknown }) =>
    ({ rpc: async () => reply }) as unknown as SupabaseClient

  it('is null while the function is missing (0215 not applied)', async () => {
    const missing = { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }
    expect(await classAttendanceDays(client(missing), '2026-10-01', '2026-10-15')).toBeNull()
  })

  it('is null on any other error or an unusable reply', async () => {
    expect(await classAttendanceDays(client({ data: null, error: { code: '42501' } }), 'a', 'b')).toBeNull()
    expect(await classAttendanceDays(client({ data: null, error: null }), 'a', 'b')).toBeNull()
  })

  it('returns the dates, bare or wrapped in a one-column row', async () => {
    expect(await classAttendanceDays(client({ data: ['2026-10-01'], error: null }), 'a', 'b')).toEqual(['2026-10-01'])
    const wrapped = { data: [{ student_class_attendance_days: '2026-10-04' }], error: null }
    expect(await classAttendanceDays(client(wrapped), 'a', 'b')).toEqual(['2026-10-04'])
  })
})
