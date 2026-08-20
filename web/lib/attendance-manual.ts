// Pure helpers for manual student attendance marking, leave management, and
// the off-day calendar (issue #29). Kept side-effect free for unit testing;
// pages/actions do the Supabase I/O around these.

export interface RosterStudent {
  id: string
  full_name: string
  class_name: string | null
  section: string | null
  roll_number?: number | null
}

/**
 * Roster rows for the mark-attendance screen, filtered by class/section and
 * ordered by Roll number (matching attendance-student-mark.html) with
 * un-rolled students falling back to a name sort at the end. The OfficeTime filter
 * left with issue #100.
 */
export function filterRoster(
  students: RosterStudent[],
  className: string,
  section: string,
): { id: string; full_name: string; roll_number: number | null }[] {
  return students
    .filter((s) => (!className || s.class_name === className) && (!section || s.section === section))
    .map((s) => ({ id: s.id, full_name: s.full_name, roll_number: s.roll_number ?? null }))
    .sort((a, b) => {
      if (a.roll_number != null && b.roll_number != null) return a.roll_number - b.roll_number
      if (a.roll_number != null) return -1
      if (b.roll_number != null) return 1
      return a.full_name.localeCompare(b.full_name)
    })
}

export type LeaveStatus = 'pending' | 'approved' | 'rejected'

export interface RawLeave {
  id: string
  from_day: string
  to_day: string
  reason: string | null
  status: string
  created_at: string
}

export interface UnifiedLeave {
  id: string
  kind: 'student' | 'employee'
  personId: string
  name: string
  fromDay: string
  toDay: string
  reason: string | null
  status: LeaveStatus
  createdAt: string
}

/** Merge student + employee leave rows into one list, newest first. */
export function mergeLeaves(
  studentLeaves: (RawLeave & { student_id: string })[],
  employeeLeaves: (RawLeave & { employee_id: string })[],
  studentNames: Map<string, string>,
  employeeNames: Map<string, string>,
): UnifiedLeave[] {
  const rows: UnifiedLeave[] = [
    ...studentLeaves.map((l) => ({
      id: l.id,
      kind: 'student' as const,
      personId: l.student_id,
      name: studentNames.get(l.student_id) ?? '—',
      fromDay: l.from_day,
      toDay: l.to_day,
      reason: l.reason,
      status: l.status as LeaveStatus,
      createdAt: l.created_at,
    })),
    ...employeeLeaves.map((l) => ({
      id: l.id,
      kind: 'employee' as const,
      personId: l.employee_id,
      name: employeeNames.get(l.employee_id) ?? '—',
      fromDay: l.from_day,
      toDay: l.to_day,
      reason: l.reason,
      status: l.status as LeaveStatus,
      createdAt: l.created_at,
    })),
  ]
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function filterLeaves(rows: UnifiedLeave[], query: string, kind: string): UnifiedLeave[] {
  const q = query.trim().toLowerCase()
  return rows.filter((r) => (!q || r.name.toLowerCase().includes(q)) && (!kind || r.kind === kind))
}

export interface OffDay {
  day: string // YYYY-MM-DD
  label: string | null
  is_significant: boolean
}

export interface CalendarCell {
  day: number | null
  iso: string | null
  isOff: boolean
  isSignificant: boolean
  label: string | null
}

/** Saturday shades as the regular weekly off-day even with no off_days row
 *  (no recurring-rule table exists yet); an explicit off_days row adds a
 *  label and/or significance on top. Shared by monthGrid and dateRangeDays so
 *  the rule lives in exactly one place. */
function dayOffInfo(iso: string, offByDay: Map<string, OffDay>): Pick<CalendarCell, 'isOff' | 'isSignificant' | 'label'> {
  const [y, m, d] = iso.split('-').map(Number)
  const isSaturday = new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 6
  const off = offByDay.get(iso)
  return { isOff: isSaturday || !!off, isSignificant: !!off?.is_significant, label: off?.label ?? null }
}

function addDaysIso(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + delta))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

/**
 * One month's day grid (Sun-first, matching off-day-calendar.html), leading
 * blanks for alignment. School-specific extra off-days and significant days
 * come from the off_days table (see dayOffInfo for the Saturday rule).
 */
export function monthGrid(year: number, month: number, offDays: OffDay[]): CalendarCell[] {
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`
  const byDay = new Map(offDays.filter((o) => o.day.startsWith(prefix)).map((o) => [o.day, o]))
  const startWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay()
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()

  const cells: CalendarCell[] = []
  for (let i = 0; i < startWeekday; i++) {
    cells.push({ day: null, iso: null, isOff: false, isSignificant: false, label: null })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${prefix}-${String(d).padStart(2, '0')}`
    cells.push({ day: d, iso, ...dayOffInfo(iso, byDay) })
  }
  return cells
}

// Student Log Today/Custom filters (map #380): an arbitrary [fromIso, toIso]
// range doesn't fit monthGrid's one-calendar-month shape, so this is the
// flat-list equivalent, sharing dayOffInfo rather than re-deriving the
// Saturday/off_days rule a third time. A missing or reversed range returns no
// days — the caller's empty state, not a crash or a runaway loop. Capped at
// a year of days for the same reason: this renders as a flat list/print
// sheet, not a paged table, so an unbounded range would just hang the page.
const MAX_RANGE_DAYS = 366

export function dateRangeDays(fromIso: string, toIso: string, offDays: OffDay[]): { iso: string; isOff: boolean }[] {
  if (!fromIso || !toIso || fromIso > toIso) return []
  const byDay = new Map(offDays.map((o) => [o.day, o]))
  const days: { iso: string; isOff: boolean }[] = []
  let cursor = fromIso
  while (cursor <= toIso && days.length < MAX_RANGE_DAYS) {
    days.push({ iso: cursor, isOff: dayOffInfo(cursor, byDay).isOff })
    cursor = addDaysIso(cursor, 1)
  }
  return days
}

// Attendance Book (issue #30, PRD §5.3): one cell's P/A/blank for the monthly
// register (ui/school-owner/attendance-book.html). A day only ever reads 'A'
// once it's actually passed and isn't excused (off-day or approved leave) —
// future days and excused days stay blank rather than falsely reading absent.
export type RegisterDayStatus = 'present' | 'absent' | 'blank'

export function registerDayStatus(args: {
  iso: string
  today: string
  isOff: boolean
  onApprovedLeave: boolean
  hasRecord: boolean
}): RegisterDayStatus {
  if (args.hasRecord) return 'present'
  if (args.iso > args.today) return 'blank'
  if (args.isOff || args.onApprovedLeave) return 'blank'
  return 'absent'
}

// Student Log (map #380, docs/011_student_module.md): a single student's
// day-by-day history needs Present/Absent/Leave/Holiday told apart, where the
// Book's register grid deliberately collapses the last three into one 'blank'
// cell. Delegates to registerDayStatus for the present/absent/blank split —
// that function stays the one place "is this day excused at all" is decided —
// and only disambiguates *why* a 'blank' day is blank, so the two functions
// can't drift out of precedence sync with each other. A future day returns
// null rather than a status: the page clips its query range at `today`, so
// callers should never actually see one.
// Values match the `status.*` i18n keys already used by the employee
// attendance badges (present/absent/on_leave), plus 'holiday' for this log.
export type StudentLogDayStatus = 'present' | 'absent' | 'on_leave' | 'holiday'

export function studentLogDayStatus(
  args: Parameters<typeof registerDayStatus>[0],
): StudentLogDayStatus | null {
  const coarse = registerDayStatus(args)
  if (coarse !== 'blank') return coarse
  if (args.iso > args.today) return null
  // Off-day wins over approved leave when both are true: school is closed
  // either way, so the institutional fact outranks the personal one.
  return args.isOff ? 'holiday' : 'on_leave'
}

// Progress Report (issue #33, PRD §5.5): the "Attendance %" info-grid figure
// (progress-report-preview.html). attendance_records only ever holds
// PRESENT-ish rows (absence is inferred from the ABSENCE of a row, migration
// 0046) and off-days/approved leave must not count against the student —
// so a percentage needs presentCount against (presentCount + genuinely
// absent working days), the latter from the new absent_working_days_in_range
// RPC (migration 0053, generalizing issue #34's absent_working_days_in_month)
// rather than a raw row-count ratio, which would silently exclude every
// off-day/leave day from the denominator's cost and over-state attendance.
/** Percent of working days present, rounded to the nearest whole number.
 * Null (not 0) when there are no working days to consider at all (a brand
 * new student with nothing recorded yet), so the page can show "—" instead
 * of a misleading 0%. */
export function attendancePercent(presentCount: number, absentWorkingDays: number): number | null {
  const total = presentCount + absentWorkingDays
  if (total <= 0) return null
  return Math.round((presentCount / total) * 100)
}
