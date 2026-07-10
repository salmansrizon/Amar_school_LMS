// Pure helpers for manual student attendance marking, leave management, and
// the off-day calendar (issue #29). Kept side-effect free for unit testing;
// pages/actions do the Supabase I/O around these.

export interface RosterStudent {
  id: string
  full_name: string
  class_name: string | null
  section: string | null
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

export function filterRoster(
  students: RosterStudent[],
  className: string,
  section: string,
): { id: string; full_name: string }[] {
  return students
    .filter((s) => (!className || s.class_name === className) && (!section || s.section === section))
    .map((s) => ({ id: s.id, full_name: s.full_name }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name))
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
