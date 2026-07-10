import { describe, it, expect } from 'vitest'
import {
  ROUTINE_DAYS,
  ROUTINE_PERIODS,
  dayLabel,
  indexSlots,
  formatBytes,
  type RoutineSlot,
} from '@/lib/routine'

describe('routine grid constants', () => {
  it('renders the Sun–Thu working week over 8 periods', () => {
    expect([...ROUTINE_DAYS]).toEqual([0, 1, 2, 3, 4])
    expect([...ROUTINE_PERIODS]).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })
})

describe('dayLabel', () => {
  it('labels days in both languages', () => {
    expect(dayLabel(0, 'en')).toBe('Sun')
    expect(dayLabel(0, 'bn')).toBe('রবি')
    expect(dayLabel(4, 'en')).toBe('Thu')
    expect(dayLabel(6, 'en')).toBe('Sat')
  })

  it('falls back to the number for unknown days', () => {
    expect(dayLabel(9, 'en')).toBe('9')
  })
})

describe('indexSlots', () => {
  const slot = (day: number, period: number): RoutineSlot => ({
    day_of_week: day,
    period,
    subject_id: null,
    teacher_id: null,
    room_id: null,
  })

  it('keys each slot by day:period', () => {
    const map = indexSlots([slot(0, 1), slot(3, 5)])
    expect(map.get('0:1')).toBeDefined()
    expect(map.get('3:5')).toBeDefined()
    expect(map.get('1:1')).toBeUndefined()
  })

  it('does not confuse day 1 period 12 with day 11 period 2', () => {
    const map = indexSlots([slot(1, 12)])
    expect(map.get('1:12')).toBeDefined()
    expect(map.get('11:2')).toBeUndefined()
  })

  it('handles an empty routine', () => {
    expect(indexSlots([]).size).toBe(0)
  })
})

describe('formatBytes', () => {
  it('formats sub-MB sizes in KB', () => {
    expect(formatBytes(348 * 1024)).toBe('348 KB')
    expect(formatBytes(500)).toBe('1 KB') // rounds up tiny files to 1 KB
  })

  it('formats MB with one decimal', () => {
    expect(formatBytes(1.2 * 1024 * 1024)).toBe('1.2 MB')
    expect(formatBytes(10 * 1024 * 1024)).toBe('10.0 MB')
  })

  it('returns null for missing or nonsense sizes', () => {
    expect(formatBytes(null)).toBeNull()
    expect(formatBytes(undefined)).toBeNull()
    expect(formatBytes(0)).toBeNull()
    expect(formatBytes(-5)).toBeNull()
  })
})
