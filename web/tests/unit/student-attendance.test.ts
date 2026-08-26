import { describe, it, expect } from 'vitest'
import { monthGrid, attendancePercent, monthRange, shiftMonth, daysInMonth } from '@/lib/student/attendance'

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
