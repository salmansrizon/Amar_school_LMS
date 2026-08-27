// The Student's own attendance calendar (#451), kept pure.
//
// The one rule that matters: attendance_records only ever holds present-ish
// rows, so absence is never counted from them. The absent count comes from
// absent_working_days_in_range (via student_absent_working_days), which is the
// same definition the absent-fine formula and the absence-SMS rules use — so
// the calendar agrees with the money rather than contradicting it.

export type DayState = 'present' | 'leave' | 'off' | 'blank'

export interface AttendanceDay {
  date: string
  state: DayState
  /** Set for 'off': the holiday's name where the school gave one. */
  label?: string | null
}

export interface MonthInputs {
  year: number
  /** 1-12. */
  month: number
  presentDates: string[]
  approvedLeaveRanges: { from_day: string; to_day: string }[]
  offDays: { day: string; label: string | null }[]
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function coversDate(range: { from_day: string; to_day: string }, date: string): boolean {
  return date >= range.from_day && date <= range.to_day
}

/**
 * One row per calendar day.
 *
 * Precedence: present beats everything (they were there, whatever the calendar
 * said), then approved leave, then an off day. A day with none of those is
 * blank rather than "absent" — a future date, or a day nobody marked, is not an
 * absence, and calling it one is exactly the trap this module exists to avoid.
 */
export function monthGrid(input: MonthInputs): AttendanceDay[] {
  const present = new Set(input.presentDates)
  const offByDay = new Map(input.offDays.map((o) => [o.day, o.label]))
  const out: AttendanceDay[] = []

  for (let day = 1; day <= daysInMonth(input.year, input.month); day += 1) {
    const date = iso(input.year, input.month, day)
    if (present.has(date)) out.push({ date, state: 'present' })
    else if (input.approvedLeaveRanges.some((r) => coversDate(r, date)))
      out.push({ date, state: 'leave' })
    else if (offByDay.has(date)) out.push({ date, state: 'off', label: offByDay.get(date) ?? null })
    else out.push({ date, state: 'blank' })
  }
  return out
}

/**
 * How many empty cells the grid needs before day 1, for a Sunday-start week.
 *
 * Without this the calendar rendered day 1 in the first column whatever weekday
 * it was, so no column meant anything and the whole thing was unreadable as a
 * calendar. Sunday-start matches the routine (রবি … বৃহঃ, with Friday and
 * Saturday the weekend), so the school week reads as one block.
 */
export function monthLeadIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
}

/**
 * Present over working days, as a whole percent.
 *
 * `absentWorkingDays` must come from the shared RPC. Working days = present +
 * absent working days, so a month with no marked attendance at all returns
 * null rather than 0% — nothing has happened yet, which is not the same as
 * never turning up.
 */
export function attendancePercent(presentCount: number, absentWorkingDays: number): number | null {
  const workingDays = presentCount + absentWorkingDays
  if (workingDays <= 0) return null
  return Math.round((presentCount / workingDays) * 100)
}

/** First and last date of a month, for the RPC's range arguments. */
export function monthRange(year: number, month: number): { start: string; end: string } {
  return { start: iso(year, month, 1), end: iso(year, month, daysInMonth(year, month)) }
}

/** Step a {year, month} pair, so the calendar's arrows do not need date maths. */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const zero = month - 1 + delta
  return { year: year + Math.floor(zero / 12), month: ((zero % 12) + 12) % 12 + 1 }
}
