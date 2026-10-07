// The Student's own attendance calendar (#451), kept pure.
//
// The one rule that matters: attendance_records only ever holds present-ish
// rows, so absence is never counted from them. The absent count comes from
// absent_working_days_in_range (via student_absent_working_days), which is the
// same definition the absent-fine formula and the absence-SMS rules use — so
// the calendar agrees with the money rather than contradicting it.

export type DayState = 'present' | 'leave' | 'off' | 'absent' | 'blank'

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

export interface AttendanceOutcome {
  /** Whole percent; null when there is nothing to judge the Student by. */
  percent: number | null
  /** The figure for "absent days". */
  absentDays: number
  /** Days to draw as absent. Empty when the taken days are not known. */
  absentDates: ReadonlySet<string>
}

/**
 * The one decision behind the percentage, the absent figure and the calendar's
 * absent cells, for the attendance page and the home alike.
 *
 * `takenDates` are the days attendance was taken for the Student's class and
 * that count for them (student_class_attendance_days, migration 0215: off-days,
 * weekly off-days and approved leave are already left out there). null means
 * the function is not available; an empty list says nothing either (an
 * unplaced Student gets no rows). Both keep the behaviour from before 0215:
 * the shared RPC's absent count, and no percentage without a present row.
 *
 * With taken days known, the Student is judged on those days only: absent on
 * every one of them is 0%, not "—", and each is an absent cell.
 */
export function attendanceOutcome(input: {
  presentDates: readonly string[]
  takenDates: readonly string[] | null
  /** From student_absent_working_days. */
  absentWorkingDays: number
  today: string
}): AttendanceOutcome {
  const present = new Set(input.presentDates)
  if (!input.takenDates?.length)
    return {
      percent: present.size ? attendancePercent(present.size, input.absentWorkingDays) : null,
      absentDays: input.absentWorkingDays,
      absentDates: new Set(),
    }
  const absentDates = new Set(input.takenDates.filter((d) => d <= input.today && !present.has(d)))
  return {
    percent: attendancePercent(present.size, absentDates.size),
    absentDays: absentDates.size,
    absentDates,
  }
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
