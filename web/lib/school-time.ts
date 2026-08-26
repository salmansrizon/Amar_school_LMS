// What "today" means to a School.
//
// Everything else in this codebase computes dates in UTC, by an explicit
// decision recorded in lib/attendance.ts: "ponytail: single-timezone
// assumption; add schools.timezone when a non-UTC deployment needs it." That is
// fine for attendance, where the number is reconciled by a nightly job.
//
// It is not fine for a Student opening the portal at 6am and being shown
// yesterday's routine, which is what UTC gives you in Bangladesh (UTC+6) for
// the first six hours of every day. So the student-facing surfaces resolve the
// date here instead.
//
// ponytail: one constant, not a schools.timezone column. Every School in this
// product is in Bangladesh, and a per-School setting nobody would ever change
// is worse than a constant that is right today and greppable when it stops
// being. When a School outside Bangladesh signs up, this is the one place to
// look.
export const SCHOOL_TIME_ZONE = 'Asia/Dhaka'

/** `YYYY-MM-DD` for the School's own calendar day. en-CA formats as ISO. */
export function schoolToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SCHOOL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** Day of week for a `YYYY-MM-DD` date: 0 = Sunday, matching routine_slots. */
export function dayOfWeek(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** `YYYY-MM-DD` shifted by whole days, without tripping over month ends. */
export function addDays(isoDate: string, delta: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const shifted = new Date(Date.UTC(y, m - 1, d + delta))
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, '0'),
    String(shifted.getUTCDate()).padStart(2, '0'),
  ].join('-')
}
