import { describe, it, expect } from 'vitest'
import { planFor, todayAndTomorrow, weekPlan, usedPeriods, type RoutineRow } from '@/lib/student/routine'
import { schoolToday, dayOfWeek, addDays, SCHOOL_TIME_ZONE } from '@/lib/school-time'

const slot = (day: number, period: number, subject = 'Physics'): RoutineRow => ({
  day_of_week: day,
  period,
  subject_name: subject,
  teacher_name: 'Karim Sir',
  room_name: '204',
})

// 2026-08-25 is a Tuesday; 2026-08-28 a Friday (weekend in Bangladesh).
const TUESDAY = '2026-08-25'
const THURSDAY = '2026-08-27'
const FRIDAY = '2026-08-28'

describe('school-time', () => {
  it('resolves the school day in Dhaka, not UTC', () => {
    // 22:30 UTC on the 25th is already 04:30 on the 26th in Dhaka. UTC would
    // show a Student yesterday's routine for the first six hours of every day.
    expect(schoolToday(new Date('2026-08-25T22:30:00Z'))).toBe('2026-08-26')
    expect(schoolToday(new Date('2026-08-25T09:00:00Z'))).toBe('2026-08-25')
    expect(SCHOOL_TIME_ZONE).toBe('Asia/Dhaka')
  })

  it('numbers days the way routine_slots does (0 = Sunday)', () => {
    expect(dayOfWeek('2026-08-23')).toBe(0)
    expect(dayOfWeek(TUESDAY)).toBe(2)
  })

  it('adds days across a month end', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })
})

describe('planFor', () => {
  const rows = [slot(2, 3), slot(2, 1, 'Bangla'), slot(4, 2)]

  it('lists a school day in period order', () => {
    const plan = planFor(TUESDAY, rows, [])
    expect(plan.kind).toBe('classes')
    expect(plan.periods.map((p) => p.period)).toEqual([1, 3])
    expect(plan.periods[0].subject_name).toBe('Bangla')
  })

  it('calls Friday a weekend, not an empty day', () => {
    expect(planFor(FRIDAY, rows, []).kind).toBe('weekend')
  })

  it('says WHY a day is off, and outranks the weekly grid', () => {
    // Tuesday has classes, but the school is closed — the closure wins, and the
    // Student is told the reason rather than shown a blank.
    const plan = planFor(TUESDAY, rows, [{ day: TUESDAY, label: 'Eid-ul-Fitr' }])
    expect(plan.kind).toBe('off-day')
    expect(plan.offDayLabel).toBe('Eid-ul-Fitr')
    expect(plan.periods).toEqual([])
  })

  it('tolerates an off day with no label', () => {
    expect(planFor(TUESDAY, rows, [{ day: TUESDAY, label: null }]).offDayLabel).toBeNull()
  })

  it('distinguishes "no routine published" from "day off"', () => {
    // The view returns nothing until published_at is set, so a school day with
    // zero rows means unpublished — not a holiday.
    expect(planFor(THURSDAY, [], []).kind).toBe('no-routine')
  })
})

describe('todayAndTomorrow', () => {
  it('returns exactly the two days the home screen shows', () => {
    const plans = todayAndTomorrow(THURSDAY, [slot(4, 1)], [])
    expect(plans.map((p) => p.date)).toEqual([THURSDAY, FRIDAY])
    expect(plans[0].kind).toBe('classes')
    expect(plans[1].kind).toBe('weekend')
  })
})

describe('weekPlan / usedPeriods', () => {
  it('keeps every school day, including the empty ones', () => {
    const week = weekPlan([slot(0, 1)])
    expect(week.map((d) => d.day)).toEqual([0, 1, 2, 3, 4])
    expect(week[0].periods).toHaveLength(1)
    expect(week[1].periods).toEqual([])
  })

  it('sizes the grid to the periods actually used', () => {
    expect(usedPeriods([slot(0, 5), slot(1, 2), slot(2, 5)])).toEqual([2, 5])
    expect(usedPeriods([])).toEqual([])
  })
})
