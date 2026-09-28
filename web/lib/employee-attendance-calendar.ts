// Pure calendar logic for the three new EMPLOYEE attendance/leave calendars:
// the per-employee month view (employees/[id]/attendance), the school-wide
// Leave Calendar overlay (attendance/off-days), and the school-wide Employee
// Attendance Calendar (attendance/employee). Kept side-effect free for unit
// testing, same split as lib/attendance-manual.ts's monthGrid — pages/actions
// do the Supabase I/O around these.

import { monthGrid, type OffDay, type CalendarCell } from './attendance-manual'
import { attendanceRate, attendanceBand, type AttendanceBand } from './dashboard'
import type { Lang } from './i18n'

/** Sun-first short weekday labels, matching monthGrid's own week start and
 *  off-days/page.tsx's existing WEEKDAY_LABELS convention. Shared by the two
 *  new interactive month grids so the header row reads the same everywhere. */
export const WEEKDAY_SHORT: { bn: string; en: string }[] = [
  { bn: 'রবি', en: 'Sun' },
  { bn: 'সোম', en: 'Mon' },
  { bn: 'মঙ্গল', en: 'Tue' },
  { bn: 'বুধ', en: 'Wed' },
  { bn: 'বৃহঃ', en: 'Thu' },
  { bn: 'শুক্র', en: 'Fri' },
  { bn: 'শনি', en: 'Sat' },
]

/** "September 2026" / "সেপ্টেম্বর ২০২৬" — native Intl, not a hand-rolled month
 *  name table (the off-days page's own MONTH_NAMES stays local to its
 *  12-month-a-year mini grid; this is one active month, a different shape). */
export function formatMonthYear(year: number, month0: number, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month0, 1)))
}

/** "YYYY-MM" shifted by whole months, wrapping the year — the one place
 *  month-nav prev/next links compute their target, so a page and its test
 *  share the same arithmetic. */
export function shiftYearMonth(yyyyMM: string, delta: number): string {
  const [y, m] = yyyyMM.split('-').map(Number)
  const total = y * 12 + (m - 1) + delta
  const year = Math.floor(total / 12)
  const month = (total % 12) + 1
  return `${year}-${String(month).padStart(2, '0')}`
}

/** The active month for a calendar page: `?month=YYYY-MM` when present and
 *  well-formed, else the School's current month. Malformed input (a stray
 *  query string, a half-typed URL) falls back rather than crashing the page. */
export function parseMonthParam(param: string | undefined, todayIso: string): { year: number; month0: number } {
  const source = param && /^\d{4}-\d{2}$/.test(param) ? param : todayIso.slice(0, 7)
  const [y, m] = source.split('-').map(Number)
  const month0 = Math.min(Math.max(m - 1, 0), 11)
  return { year: y, month0 }
}

// ---------------------------------------------------------------------------
// Part 1: one employee's own month (employees/[id]/attendance)

export type EmployeeDayStatus = 'present' | 'absent' | 'on_leave' | 'off' | 'future'

/** A day's status for one employee's own calendar. Precedence mirrors
 *  studentLogDayStatus's rule (lib/attendance-manual.ts) — an actual
 *  attendance_records row is the honest fact and outranks every inference:
 *  an employee who worked an off-day or a leave day still reads 'present',
 *  because the row says they were there. Only once there is no row does the
 *  day fall through institutional facts (future, then off-day) before the
 *  personal one (approved leave), landing on 'absent' last. */
export function employeeDayStatus(args: {
  iso: string
  today: string
  isOff: boolean
  onApprovedLeave: boolean
  hasRecord: boolean
}): EmployeeDayStatus {
  if (args.hasRecord) return 'present'
  if (args.iso > args.today) return 'future'
  if (args.isOff) return 'off'
  if (args.onApprovedLeave) return 'on_leave'
  return 'absent'
}

export interface EmployeeCalendarCell extends CalendarCell {
  status: EmployeeDayStatus | null // null only for a leading blank cell
  entry: string | null
  exit: string | null
}

export function buildEmployeeMonthCalendar(args: {
  year: number
  month0: number
  today: string
  offDays: OffDay[]
  weeklyOffDays: readonly number[]
  records: { att_date: string; entry_at: string; exit_at: string | null }[]
  approvedLeaves: { from_day: string; to_day: string }[]
}): EmployeeCalendarCell[] {
  const grid = monthGrid(args.year, args.month0, args.offDays, args.weeklyOffDays)
  const recordByDay = new Map(args.records.map((r) => [r.att_date, r]))
  return grid.map((cell) => {
    if (!cell.iso) return { ...cell, status: null, entry: null, exit: null }
    const record = recordByDay.get(cell.iso)
    const onLeave = args.approvedLeaves.some((l) => l.from_day <= cell.iso! && l.to_day >= cell.iso!)
    const status = employeeDayStatus({
      iso: cell.iso,
      today: args.today,
      isOff: cell.isOff,
      onApprovedLeave: onLeave,
      hasRecord: !!record,
    })
    return { ...cell, status, entry: record?.entry_at ?? null, exit: record?.exit_at ?? null }
  })
}

export interface EmployeeMonthSummary {
  presentDays: number
  absentDays: number
  leaveDays: number
  /** Percent of (present + absent) days present — off-days/leave/future days
   *  don't count against the employee, same reasoning as attendancePercent
   *  (lib/attendance-manual.ts). Null when the month has no working days yet. */
  rate: number | null
  band: AttendanceBand | null
}

export function summarizeEmployeeMonth(cells: EmployeeCalendarCell[]): EmployeeMonthSummary {
  let presentDays = 0
  let absentDays = 0
  let leaveDays = 0
  for (const c of cells) {
    if (c.status === 'present') presentDays++
    else if (c.status === 'absent') absentDays++
    else if (c.status === 'on_leave') leaveDays++
  }
  const total = presentDays + absentDays
  const rate = total > 0 ? attendanceRate(presentDays, total) : null
  return { presentDays, absentDays, leaveDays, rate, band: rate !== null ? attendanceBand(rate) : null }
}

// ---------------------------------------------------------------------------
// Part 2a: school-wide Leave Calendar overlay (attendance/off-days)

export interface LeaveCalendarPerson {
  name: string
}

export interface LeaveCalendarDayCell extends CalendarCell {
  approved: LeaveCalendarPerson[]
  pending: LeaveCalendarPerson[]
}

export function buildLeaveCalendarMonth(args: {
  year: number
  month0: number
  offDays: OffDay[]
  weeklyOffDays: readonly number[]
  leaves: { employee_name: string; from_day: string; to_day: string; status: string }[]
}): LeaveCalendarDayCell[] {
  const grid = monthGrid(args.year, args.month0, args.offDays, args.weeklyOffDays)
  return grid.map((cell) => {
    if (!cell.iso) return { ...cell, approved: [], pending: [] }
    const onDay = args.leaves.filter((l) => l.from_day <= cell.iso! && l.to_day >= cell.iso!)
    return {
      ...cell,
      approved: onDay.filter((l) => l.status === 'approved').map((l) => ({ name: l.employee_name })),
      pending: onDay.filter((l) => l.status === 'pending').map((l) => ({ name: l.employee_name })),
    }
  })
}

// ---------------------------------------------------------------------------
// Part 2b: school-wide Employee Attendance Calendar (attendance/employee)

export type SchoolDayEmployeeStatus = 'present' | 'absent' | 'on_leave'

export interface SchoolDayEmployeeRow {
  name: string
  status: SchoolDayEmployeeStatus
  entry: string | null
}

export interface SchoolAttendanceDayCell extends CalendarCell {
  isFuture: boolean
  presentCount: number
  totalCount: number
  /** attendanceRate() of present/total for a real, past-or-today working day;
   *  null on a blank cell, an off-day or a future day — there is nothing to
   *  rate yet, and showing 0% would read as "everyone absent" rather than
   *  "not applicable". */
  rate: number | null
  employees: SchoolDayEmployeeRow[]
}

export function buildSchoolAttendanceMonth(args: {
  year: number
  month0: number
  today: string
  offDays: OffDay[]
  weeklyOffDays: readonly number[]
  employees: { id: string; full_name: string }[]
  records: { person_id: string; att_date: string; entry_at: string }[]
  approvedLeaves: { employee_id: string; from_day: string; to_day: string }[]
}): SchoolAttendanceDayCell[] {
  const grid = monthGrid(args.year, args.month0, args.offDays, args.weeklyOffDays)
  const recordsByDay = new Map<string, Map<string, string>>() // iso -> employeeId -> entry_at
  for (const r of args.records) {
    if (!recordsByDay.has(r.att_date)) recordsByDay.set(r.att_date, new Map())
    recordsByDay.get(r.att_date)!.set(r.person_id, r.entry_at)
  }

  return grid.map((cell) => {
    if (!cell.iso) return { ...cell, isFuture: false, presentCount: 0, totalCount: 0, rate: null, employees: [] }
    const iso = cell.iso
    const dayRecords = recordsByDay.get(iso)
    const employees: SchoolDayEmployeeRow[] = args.employees.map((e) => {
      const entry = dayRecords?.get(e.id)
      if (entry) return { name: e.full_name, status: 'present', entry }
      const onLeave = args.approvedLeaves.some((l) => l.employee_id === e.id && l.from_day <= iso && l.to_day >= iso)
      return { name: e.full_name, status: onLeave ? 'on_leave' : 'absent', entry: null }
    })
    const presentCount = employees.filter((e) => e.status === 'present').length
    const totalCount = args.employees.length
    const isFuture = iso > args.today
    const rate = !isFuture && !cell.isOff && totalCount > 0 ? attendanceRate(presentCount, totalCount) : null
    return { ...cell, isFuture, presentCount, totalCount, rate, employees }
  })
}
