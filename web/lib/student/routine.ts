import { addDays, dayOfWeek } from '@/lib/school-time'
import { ROUTINE_DAYS } from '@/lib/routine'

// The Student's view of their week (#444), kept pure so it is testable without
// a database or a browser.
//
// routine_slots carries `day_of_week` and an ordinal `period` — no dates, no
// clock times, nothing anywhere that says when period 3 begins. So there is no
// "next class in 20 minutes" to compute, and this deliberately does not pretend
// otherwise: it answers "what does today look like, and what does tomorrow look
// like", which is what the routine on the classroom wall answers too.

export interface RoutineRow {
  day_of_week: number
  period: number
  subject_name: string | null
  teacher_name: string | null
  room_name: string | null
}

export interface OffDay {
  day: string
  label: string | null
}

/** Why a day has no classes — so an empty day can say which kind of empty. */
export type DayKind = 'classes' | 'off-day' | 'weekend' | 'no-routine'

export interface DayPlan {
  date: string
  dayOfWeek: number
  kind: DayKind
  /** Set when kind is 'off-day': the holiday's name, if the school gave one. */
  offDayLabel: string | null
  periods: RoutineRow[]
}

/** Sun–Thu is the Bangladesh school week; ROUTINE_DAYS is the builder's own
 *  list, so the two can never disagree about which days exist. */
function isSchoolDay(day: number): boolean {
  return (ROUTINE_DAYS as readonly number[]).includes(day)
}

/**
 * One day's plan.
 *
 * Order matters and is not arbitrary: a holiday outranks the weekly grid, so a
 * school that closes for Eid on a Tuesday shows "Eid" rather than Tuesday's
 * periods. An unpublished routine (no rows at all) outranks nothing — it is the
 * last thing checked, because "the school has not published yet" is only true
 * when there was no better explanation.
 */
export function planFor(date: string, rows: RoutineRow[], offDays: OffDay[]): DayPlan {
  const day = dayOfWeek(date)
  const off = offDays.find((o) => o.day === date)
  const base = { date, dayOfWeek: day, offDayLabel: null as string | null, periods: [] as RoutineRow[] }

  if (off) return { ...base, kind: 'off-day', offDayLabel: off.label }
  if (!isSchoolDay(day)) return { ...base, kind: 'weekend' }

  const periods = rows
    .filter((r) => r.day_of_week === day)
    .sort((a, b) => a.period - b.period)

  // No rows for a school day means the class has no published routine — the
  // view returns nothing at all until published_at is set.
  if (!periods.length) return { ...base, kind: 'no-routine' }
  return { ...base, kind: 'classes', periods }
}

/** Today and tomorrow, the pair the home screen shows. */
export function todayAndTomorrow(today: string, rows: RoutineRow[], offDays: OffDay[]): DayPlan[] {
  return [planFor(today, rows, offDays), planFor(addDays(today, 1), rows, offDays)]
}

/**
 * The full week, for the routine screen. Always every school day, including the
 * empty ones — a gap in the grid is information ("no class third period"), and
 * dropping it would silently renumber the day.
 */
export function weekPlan(rows: RoutineRow[]): { day: number; periods: RoutineRow[] }[] {
  return ROUTINE_DAYS.map((day) => ({
    day,
    periods: rows.filter((r) => r.day_of_week === day).sort((a, b) => a.period - b.period),
  }))
}

/** Every period number the class actually uses, so the weekly grid is exactly
 *  as tall as the timetable rather than a fixed 12 rows. */
export function usedPeriods(rows: RoutineRow[]): number[] {
  return [...new Set(rows.map((r) => r.period))].sort((a, b) => a - b)
}
