import { describe, it, expect } from 'vitest'
import {
  addDays, addMonths, clampIso, daysInMonth, formatField, isDisabledDay, isLeapYear,
  monthMatrix, moveFocus, parseIso, parseTyped, weekdayOf,
} from '@/lib/date-field'

describe('date-field', () => {
  it('leap years and month ends', () => {
    expect(isLeapYear(2000)).toBe(true)
    expect(isLeapYear(1900)).toBe(false)
    expect(daysInMonth(2024, 2)).toBe(29)
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(parseIso('2024-02-29')).toEqual([2024, 2, 29])
    expect(parseIso('2026-02-29')).toBeNull()
    expect(parseIso('2026-04-31')).toBeNull()
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01')
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29')
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15')
  })
  it('weekday and matrix are Sunday-first and calendar-exact', () => {
    expect(weekdayOf('2026-10-15')).toBe(4)
    const m = monthMatrix(2026, 10)
    expect(m).toHaveLength(6)
    expect(m[0][0].iso).toBe('2026-09-27')
    expect(m[0][0].outside).toBe(true)
    expect(m[0][4].iso).toBe('2026-10-01')
    expect(m.flat().filter((c) => !c.outside)).toHaveLength(31)
  })
  it('parses typed dates in either script and separator', () => {
    expect(parseTyped('১৫/১০/২০২৬')).toBe('2026-10-15')
    expect(parseTyped('15-10-2026')).toBe('2026-10-15')
    expect(parseTyped('5.1.2026')).toBe('2026-01-05')
    expect(parseTyped('2026-10-15')).toBe('2026-10-15')
    expect(parseTyped('31/02/2026')).toBeNull()
    expect(parseTyped('00/10/2026')).toBeNull()
    expect(parseTyped('15/13/2026')).toBeNull()
    expect(parseTyped('15/10/26')).toBeNull()
    expect(parseTyped('')).toBeNull()
  })
  it('formats in the reader digits', () => {
    expect(formatField('2026-10-05', 'en')).toBe('05/10/2026')
    expect(formatField('2026-10-05', 'bn')).toBe('০৫/১০/২০২৬')
    expect(formatField('nope', 'en')).toBe('')
  })
  it('min/max edges', () => {
    expect(isDisabledDay('2026-10-14', '2026-10-15', '2026-10-20')).toBe(true)
    expect(isDisabledDay('2026-10-15', '2026-10-15', '2026-10-20')).toBe(false)
    expect(isDisabledDay('2026-10-20', '2026-10-15', '2026-10-20')).toBe(false)
    expect(isDisabledDay('2026-10-21', '2026-10-15', '2026-10-20')).toBe(true)
    expect(clampIso('2026-01-01', '2026-10-15')).toBe('2026-10-15')
    expect(clampIso('2027-01-01', undefined, '2026-10-20')).toBe('2026-10-20')
  })
  it('keyboard moves', () => {
    expect(moveFocus('2026-10-15', 'ArrowRight')).toBe('2026-10-16')
    expect(moveFocus('2026-10-15', 'ArrowUp')).toBe('2026-10-08')
    expect(moveFocus('2026-10-15', 'PageDown')).toBe('2026-11-15')
    expect(moveFocus('2026-10-15', 'Home')).toBe('2026-10-11')
    expect(moveFocus('2026-10-15', 'End')).toBe('2026-10-17')
    expect(moveFocus('2026-10-15', 'ArrowLeft', '2026-10-15')).toBe('2026-10-15')
    expect(moveFocus('2026-10-15', 'x')).toBeNull()
  })
})
