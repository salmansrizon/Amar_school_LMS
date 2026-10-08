// Pure calendar logic for the three new EMPLOYEE attendance/leave calendars:
// the per-employee month view (employees/[id]/attendance), the school-wide
// Leave Calendar overlay (attendance/off-days), and the school-wide Employee
// Attendance Calendar (attendance/employee). Kept side-effect free for unit
// testing, same split as lib/attendance-manual.ts's monthGrid — pages/actions
// do the Supabase I/O around these.

import { monthGrid, type OffDay, type CalendarCell } from './attendance-manual'
import { attendanceRate, attendanceBand, type AttendanceBand } from './dashboard'
import { numberFmt, type Lang } from './i18n'
import { schoolToday } from './school-time'

/** A day's digits in the reader's own script (৫ for bn, 5 for en) — one place
 *  so every calendar's date numbers and counts agree, reusing the app's own
 *  numberFmt (lib/i18n.ts) rather than a hand-rolled digit map. */
export function localizeNumber(n: number, lang: Lang): string {
  return numberFmt(lang).format(n)
}

/** Which of the 7 grid columns (0=Sun..6=Sat, monthGrid's own week start) is a
 *  School's configured Weekly Off-Day — the soft column tint is independent
 *  of any one day's `isOff` (which also fires for a one-off off_days row on a
 *  working weekday), so it needs the column index, not a cell flag. */
export function isWeekendColumn(columnIndex: number, weeklyOffDays: readonly number[]): boolean {
  return weeklyOffDays.includes(columnIndex % 7)
}

/** Pads a monthGrid()-shaped grid to whole weeks and fills the leading and
 *  trailing blank cells with the adjacent month's day numbers (iso stays
 *  null, so callers keep telling a real day from a muted one by `iso`) —
 *  turning monthGrid's ragged last row into the familiar full rectangle a
 *  month calendar reads as. `blank` supplies the extra fields a specific
 *  calendar's cell type carries beyond CalendarCell (e.g. status/entry/exit),
 *  the same values each builder already uses for its own leading blanks. */
export function withAdjacentMonthDays<T extends CalendarCell>(
  cells: T[],
  year: number,
  month0: number,
  blank: () => Omit<T, keyof CalendarCell>,
): T[] {
  const leadingCount = Math.max(cells.findIndex((c) => c.iso !== null), 0)
  const daysInPrevMonth = new Date(Date.UTC(year, month0, 0)).getUTCDate()
  const withLeading = cells.map((c, i) =>
    i < leadingCount ? { ...c, day: daysInPrevMonth - leadingCount + 1 + i } : c,
  )
  const trailingCount = (7 - (withLeading.length % 7)) % 7
  const trailing: T[] = Array.from({ length: trailingCount }, (_, i) => ({
    day: i + 1,
    iso: null,
    isOff: false,
    isSignificant: false,
    label: null,
    ...blank(),
  })) as T[]
  return [...withLeading, ...trailing]
}

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

/** One day as the reader says it ("৬ অক্টোবর, ২০২৬" / "October 6, 2026") —
 *  for a day cell's accessible name and its popover title, where a bare
 *  "2026-10-06" read out Latin digits in Bangla. Same Intl setup as
 *  formatMonthYear, so the two never disagree on locale or script. */
export function formatDayLong(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`))
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

export type EmployeeDayStatus = 'present' | 'absent' | 'on_leave' | 'off' | 'future' | 'not_started' | 'no_record'

/** "No record" (#694): a past-or-today working day on which NOBODY in the School
 *  has an Employee attendance record. The data cannot say whether the machine
 *  was never used, failed to sync, or the day was simply not marked (machines
 *  hold no last-contact time, 0213; attendance is also entered by hand), so the
 *  honest reading is "no record", not "everyone absent". One record by anyone
 *  keeps "absent" for the others — someone was marked, so the day was taken. */
export function isNoRecordDay(args: { iso: string; today: string; isOff: boolean; recordCount: number }): boolean {
  return args.iso <= args.today && !args.isOff && args.recordCount === 0
}

/** The first day an Employee's absence can be inferred: the later of their
 *  joining date and the day they were entered in the system (a veteran added
 *  today has no earlier attendance to be absent from). Null when neither is
 *  known — then nothing is clipped. Days before it are not absences (audit F1). */
export function employeeTrackingStart(joiningDate: string | null | undefined, createdAt: string | null | undefined): string | null {
  const created = createdAt ? schoolToday(new Date(createdAt)) : null
  const joined = joiningDate ? joiningDate.slice(0, 10) : null
  return joined && created ? (joined > created ? joined : created) : (joined ?? created)
}

/** A day's status for one employee's own calendar. Full order, first match wins:
 *  real record > approved leave (not before start; beats off-day only with
 *  leaveBeatsOff) > future > before start > off-day > no record (noRecordDay) >
 *  absent. Precedence mirrors
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
  /** Days before this (YYYY-MM-DD) are not absences — see employeeTrackingStart. */
  startDay?: string | null
  /** Approved leave also outranks an off-day, as on the Leave Calendar (which
   *  lists approved leave on off-days too). Default false keeps off > leave. */
  leaveBeatsOff?: boolean
  /** The whole School has no record that day (isNoRecordDay): reads 'no_record'
   *  instead of 'absent'. Default false keeps every existing caller unchanged. */
  noRecordDay?: boolean
}): EmployeeDayStatus {
  if (args.hasRecord) return 'present'
  const beforeStart = !!args.startDay && args.iso < args.startDay
  // Approved leave outranks absent and upcoming (a future approved leave is
  // still leave); off-day only yields to it when leaveBeatsOff.
  if (args.onApprovedLeave && !beforeStart && (args.leaveBeatsOff || !args.isOff)) return 'on_leave'
  if (args.iso > args.today) return 'future'
  if (beforeStart) return 'not_started'
  if (args.isOff) return 'off'
  return args.noRecordDay ? 'no_record' : 'absent'
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
  /** See employeeTrackingStart. */
  startDay?: string | null
  /** See employeeDayStatus. */
  leaveBeatsOff?: boolean
  /** Days (YYYY-MM-DD) of this month on which ANY Employee has a record. When
   *  given, a day outside it is 'no_record' instead of 'absent' (isNoRecordDay).
   *  Omit to keep the old behaviour. */
  schoolRecordedDays?: ReadonlySet<string>
}): EmployeeCalendarCell[] {
  const grid = monthGrid(args.year, args.month0, args.offDays, args.weeklyOffDays)
  const recordByDay = new Map(args.records.map((r) => [r.att_date, r]))
  const cells = grid.map((cell) => {
    if (!cell.iso) return { ...cell, status: null, entry: null, exit: null }
    const record = recordByDay.get(cell.iso)
    const onLeave = args.approvedLeaves.some((l) => l.from_day <= cell.iso! && l.to_day >= cell.iso!)
    const status = employeeDayStatus({
      iso: cell.iso,
      today: args.today,
      isOff: cell.isOff,
      onApprovedLeave: onLeave,
      hasRecord: !!record,
      startDay: args.startDay,
      leaveBeatsOff: args.leaveBeatsOff,
      noRecordDay:
        !!args.schoolRecordedDays &&
        isNoRecordDay({ iso: cell.iso, today: args.today, isOff: cell.isOff, recordCount: args.schoolRecordedDays.has(cell.iso) ? 1 : 0 }),
    })
    return { ...cell, status, entry: record?.entry_at ?? null, exit: record?.exit_at ?? null }
  })
  return withAdjacentMonthDays(cells, args.year, args.month0, () => ({ status: null, entry: null, exit: null }))
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
  /** Whether an actual off_days row exists for this date — distinct from the
   *  merged `isOff` (which also fires for the School's recurring Weekly
   *  Off-Day, e.g. every Friday, with no row at all). The calendar's
   *  Add/Remove click offers Remove only when there is a real row to delete;
   *  a day that is off purely by the weekly rule still offers Add, because
   *  labelling that particular Friday (e.g. "Eid") as a named/significant day
   *  on top of the recurring rule is the same thing AddOffDayForm already
   *  allows from the page's own always-visible copy. */
  hasOffDayRow: boolean
}

export function buildLeaveCalendarMonth(args: {
  year: number
  month0: number
  offDays: OffDay[]
  weeklyOffDays: readonly number[]
  leaves: { employee_name: string; from_day: string; to_day: string; status: string }[]
}): LeaveCalendarDayCell[] {
  const grid = monthGrid(args.year, args.month0, args.offDays, args.weeklyOffDays)
  const offDayIsos = new Set(args.offDays.map((o) => o.day))
  const cells = grid.map((cell) => {
    if (!cell.iso) return { ...cell, approved: [], pending: [], hasOffDayRow: false }
    const onDay = args.leaves.filter((l) => l.from_day <= cell.iso! && l.to_day >= cell.iso!)
    return {
      ...cell,
      approved: onDay.filter((l) => l.status === 'approved').map((l) => ({ name: l.employee_name })),
      pending: onDay.filter((l) => l.status === 'pending').map((l) => ({ name: l.employee_name })),
      hasOffDayRow: offDayIsos.has(cell.iso),
    }
  })
  return withAdjacentMonthDays(cells, args.year, args.month0, () => ({ approved: [], pending: [], hasOffDayRow: false }))
}

// ---------------------------------------------------------------------------
// Part 2b: school-wide Employee Attendance Calendar (attendance/employee)

export type SchoolDayEmployeeStatus = 'present' | 'absent' | 'on_leave' | 'no_record'

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
  /** Employees on approved leave that day — lets a future day say "on leave"
   *  instead of only "upcoming". Absent on older callers' cells. */
  leaveCount?: number
  /** See isNoRecordDay: no one has a record on this past/today working day. Set
   *  only when the builder is asked for it (markNoRecordDays). */
  noRecord?: boolean
}

export function buildSchoolAttendanceMonth(args: {
  year: number
  month0: number
  today: string
  offDays: OffDay[]
  weeklyOffDays: readonly number[]
  /** `startDay`: see employeeTrackingStart — an Employee not yet started on a
   *  day is left out of that day's list and headcount, not counted absent. */
  employees: { id: string; full_name: string; startDay?: string | null }[]
  records: { person_id: string; att_date: string; entry_at: string }[]
  approvedLeaves: { employee_id: string; from_day: string; to_day: string }[]
  /** Read a day with no record from anyone as 'no_record' (isNoRecordDay), not
   *  as everyone absent. Off by default so existing callers are unchanged. */
  markNoRecordDays?: boolean
}): SchoolAttendanceDayCell[] {
  const grid = monthGrid(args.year, args.month0, args.offDays, args.weeklyOffDays)
  const recordsByDay = new Map<string, Map<string, string>>() // iso -> employeeId -> entry_at
  for (const r of args.records) {
    if (!recordsByDay.has(r.att_date)) recordsByDay.set(r.att_date, new Map())
    recordsByDay.get(r.att_date)!.set(r.person_id, r.entry_at)
  }

  const cells = grid.map((cell) => {
    if (!cell.iso) return { ...cell, isFuture: false, presentCount: 0, totalCount: 0, rate: null, employees: [] }
    const iso = cell.iso
    const dayRecords = recordsByDay.get(iso)
    const noRecord =
      !!args.markNoRecordDays &&
      args.employees.length > 0 &&
      isNoRecordDay({ iso, today: args.today, isOff: cell.isOff, recordCount: dayRecords?.size ?? 0 })
    const employees: SchoolDayEmployeeRow[] = args.employees.flatMap((e): SchoolDayEmployeeRow[] => {
      const entry = dayRecords?.get(e.id)
      if (entry) return [{ name: e.full_name, status: 'present', entry }]
      if (e.startDay && iso < e.startDay) return []
      const onLeave = args.approvedLeaves.some((l) => l.employee_id === e.id && l.from_day <= iso && l.to_day >= iso)
      return [{ name: e.full_name, status: onLeave ? 'on_leave' : noRecord ? 'no_record' : 'absent', entry: null }]
    })
    const presentCount = employees.filter((e) => e.status === 'present').length
    const totalCount = employees.length
    const isFuture = iso > args.today
    const rate = !isFuture && !cell.isOff && !noRecord && totalCount > 0 ? attendanceRate(presentCount, totalCount) : null
    return { ...cell, isFuture, presentCount, totalCount, rate, employees, leaveCount: employees.filter((e) => e.status === 'on_leave').length, noRecord }
  })
  return withAdjacentMonthDays(cells, args.year, args.month0, () => ({
    isFuture: false,
    presentCount: 0,
    totalCount: 0,
    rate: null,
    employees: [],
  }))
}

// ---------------------------------------------------------------------------
// Off-Day Calendar's dated list view (#692)

export type OffDayListSource = 'holiday' | 'significant'

export interface OffDayListRow {
  iso: string
  weekday: number // 0=Sun..6=Sat
  label: string | null
  /** off_days carries no "imported from central" marker (importCentralOffDays
   *  copies rows as plain regular days), so only regular vs significant can be
   *  told apart; the weekly rule is summarised separately, never listed. */
  source: OffDayListSource
}

/** One row per dated off_days row of `year`, date-sorted. The recurring Weekly
 *  Off-Day is returned once as `weekly` (sorted weekday indexes), not as 52
 *  rows. */
export function buildOffDayList(
  offDays: readonly OffDay[],
  weeklyOffDays: readonly number[],
  year: number,
): { weekly: number[]; rows: OffDayListRow[] } {
  const rows = offDays
    .filter((o) => o.day.startsWith(`${year}-`))
    .map((o) => ({
      iso: o.day,
      weekday: new Date(`${o.day}T00:00:00Z`).getUTCDay(),
      label: o.label,
      source: (o.is_significant ? 'significant' : 'holiday') as OffDayListSource,
    }))
    .sort((a, b) => a.iso.localeCompare(b.iso))
  return { weekly: [...new Set(weeklyOffDays)].sort((a, b) => a - b), rows }
}
