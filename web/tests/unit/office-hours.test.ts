import { describe, it, expect } from 'vitest'
import {
  OFFICE_HOUR_DAYS,
  formatTime12h,
  validateOfficeHourTimeRange,
  officeHourShiftOptions,
  resolveActiveShift,
  expandOfficeHourSelections,
  groupOfficeHoursByCategory,
  type OfficeHourRow,
} from '@/lib/office-hours'

describe('OFFICE_HOUR_DAYS', () => {
  it('covers the full week, Sunday through Saturday, unlike the Class Routine grid', () => {
    expect([...OFFICE_HOUR_DAYS]).toEqual([0, 1, 2, 3, 4, 5, 6])
  })
})

describe('formatTime12h', () => {
  it('formats a morning time', () => {
    expect(formatTime12h('08:00:00')).toBe('8:00 AM')
  })

  it('formats an afternoon time', () => {
    expect(formatTime12h('14:00:00')).toBe('2:00 PM')
  })

  it('formats noon and midnight correctly', () => {
    expect(formatTime12h('12:00:00')).toBe('12:00 PM')
    expect(formatTime12h('00:00:00')).toBe('12:00 AM')
  })

  it('accepts a bare HH:MM value (no seconds)', () => {
    expect(formatTime12h('13:05')).toBe('1:05 PM')
  })
})

describe('validateOfficeHourTimeRange', () => {
  it('accepts End after Start', () => {
    expect(validateOfficeHourTimeRange('08:00', '14:00')).toBeNull()
  })

  it('rejects End equal to Start', () => {
    expect(validateOfficeHourTimeRange('08:00', '08:00')).not.toBeNull()
  })

  it('rejects End before Start', () => {
    expect(validateOfficeHourTimeRange('14:00', '08:00')).not.toBeNull()
  })
})

describe('officeHourShiftOptions', () => {
  it('returns canonical-order shifts filtered to what is configured', () => {
    // Stored order is not canonical order — canonical order must win (Q12).
    expect(officeHourShiftOptions(['Night', 'Morning', 'Day'])).toEqual(['Morning', 'Day', 'Night'])
  })

  it('returns an empty list for a No-Shift School', () => {
    expect(officeHourShiftOptions([])).toEqual([])
  })

  it('ignores unknown values rather than throwing', () => {
    expect(officeHourShiftOptions(['Morning', 'Noon'])).toEqual(['Morning'])
  })
})

describe('resolveActiveShift', () => {
  it('defaults to the first canonical-order option when nothing is requested', () => {
    expect(resolveActiveShift(['Morning', 'Day'], null)).toBe('Morning')
  })

  it('honours a valid requested shift', () => {
    expect(resolveActiveShift(['Morning', 'Day'], 'Day')).toBe('Day')
  })

  it('falls back to the first option when the requested shift is not configured', () => {
    expect(resolveActiveShift(['Morning', 'Day'], 'Evening')).toBe('Morning')
  })

  it('returns null for a No-Shift School regardless of what is requested', () => {
    expect(resolveActiveShift([], 'Morning')).toBeNull()
  })
})

describe('expandOfficeHourSelections', () => {
  it('produces the full cross product of categories and days', () => {
    const result = expandOfficeHourSelections(['Teacher', 'Accountant'], [0, 1, 2])
    expect(result).toHaveLength(6)
    expect(result).toContainEqual({ employee_category: 'Teacher', day_of_week: 0 })
    expect(result).toContainEqual({ employee_category: 'Accountant', day_of_week: 2 })
  })

  it('returns an empty list if either side is empty', () => {
    expect(expandOfficeHourSelections([], [0, 1])).toEqual([])
    expect(expandOfficeHourSelections(['Teacher'], [])).toEqual([])
  })
})

describe('groupOfficeHoursByCategory', () => {
  const row = (category: string, day: number, start = '08:00:00', end = '14:00:00'): OfficeHourRow => ({
    id: `${category}-${day}`,
    employee_category: category,
    day_of_week: day,
    start_time: start,
    end_time: end,
  })

  it('only includes categories with at least one saved entry (Q7)', () => {
    const grouped = groupOfficeHoursByCategory(
      [row('Teacher', 0)],
      ['Teacher', 'Office Staff', 'Accountant'],
    )
    expect(grouped.map((g) => g.category)).toEqual(['Teacher'])
  })

  it('orders rows by the canonical EMPLOYEE_CATEGORIES declaration order, not alphabetically', () => {
    const grouped = groupOfficeHoursByCategory(
      [row('Accountant', 0), row('Teacher', 0)],
      ['Teacher', 'Office Staff', 'Management', 'Security', 'Head Teacher', 'Principal', 'Vice Principal', 'Registrar', 'Office Clerk', 'Accountant'],
    )
    // Teacher is declared before Accountant in EMPLOYEE_CATEGORIES.
    expect(grouped.map((g) => g.category)).toEqual(['Teacher', 'Accountant'])
  })

  it('indexes each category row by day of week for O(1) cell lookup', () => {
    const grouped = groupOfficeHoursByCategory([row('Teacher', 0), row('Teacher', 4, '08:00:00', '13:00:00')], [
      'Teacher',
    ])
    expect(grouped[0]!.cells.get(0)!.end_time).toBe('14:00:00')
    expect(grouped[0]!.cells.get(4)!.end_time).toBe('13:00:00')
    expect(grouped[0]!.cells.get(1)).toBeUndefined()
  })
})
