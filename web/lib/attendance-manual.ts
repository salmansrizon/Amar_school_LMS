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

export function studentClassOptions(students: RosterStudent[]): string[] {
  return [...new Set(students.map((s) => s.class_name).filter((c): c is string => !!c))].sort()
}

export function studentSectionOptions(students: RosterStudent[], className: string): string[] {
  return [
    ...new Set(
      students
        .filter((s) => s.class_name === className)
        .map((s) => s.section)
        .filter((s): s is string => !!s),
    ),
  ].sort()
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

/**
 * One month's day grid (Sun-first, matching off-day-calendar.html), leading
 * blanks for alignment. Every Saturday shades as the regular weekly off-day
 * even with no off_days row (no recurring-rule table exists yet) — School-
 * specific extra off-days and significant days come from the off_days table.
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
    const isSaturday = new Date(Date.UTC(year, month, d)).getUTCDay() === 6
    const off = byDay.get(iso)
    cells.push({
      day: d,
      iso,
      isOff: isSaturday || !!off,
      isSignificant: !!off?.is_significant,
      label: off?.label ?? null,
    })
  }
  return cells
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
