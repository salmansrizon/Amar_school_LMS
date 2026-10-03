import type { MessageKey } from '@/lib/i18n'

// The Attendance module's tab/group routing data (map #667/#669), lifted out
// of `app/school/attendance/attendance-tabs.tsx` so `lib/school-nav.ts` (the
// sidebar's own data) can read "what's this group's default route" without
// a lib -> app import, which the layering in AGENTS.md forbids (Presentation
// depends on lib, never the reverse). `attendance-tabs.tsx` imports these
// same arrays to render its in-page tab bar — one source of truth, not two
// copies of the same hrefs to keep in sync.

export interface AttendanceTab {
  href: string
  key: MessageKey
}

export const ATTENDANCE_STUDENT_TABS: AttendanceTab[] = [
  { href: '/school/attendance/mark', key: 'attendance.tabMark' },
  { href: '/school/attendance/book', key: 'attendance.tabBook' },
  { href: '/school/attendance/student-log', key: 'attendance.tabStudentLog' },
  { href: '/school/attendance/leave/student', key: 'attendance.tabLeave' },
]

// Office Hour moved here from Institute Setup (issue #669, ADR 0029) as the
// Employees group's first tab — the group's default sidebar route
// (attendanceGroupHref('employees')) follows automatically since it always
// reads tabs[0]. This route move is itself the Permission Grant change (see
// ADR 0029): Office Hour is now gated by `attendance`, not `institute`.
// Grace Time (issue #671, ADR 0030) follows immediately after — the
// Employees-module grace UI and retired per-Employee Office Time both moved
// here.
export const ATTENDANCE_EMPLOYEE_TABS: AttendanceTab[] = [
  { href: '/school/attendance/employee/office-hour', key: 'attendance.tabOfficeHour' },
  { href: '/school/attendance/employee/grace-time', key: 'attendance.tabGraceTime' },
  { href: '/school/attendance/employee', key: 'attendance.tabEmployee' },
  { href: '/school/attendance/leave/employee', key: 'attendance.tabLeave' },
]

// Machine Attendance (issue #675): attendance-machine configuration and the
// RFID / employee enrollment data the future Windows sync service will upload.
export const ATTENDANCE_MACHINE_TABS: AttendanceTab[] = [
  { href: '/school/attendance/machine', key: 'attendance.tabMachineSetup' },
  { href: '/school/attendance/machine/students', key: 'attendance.tabStudentRfid' },
  { href: '/school/attendance/machine/employees', key: 'attendance.tabEmployeeEnrollment' },
]

export interface AttendanceGroup {
  id: 'students' | 'employees' | 'off-days' | 'machine'
  labelKey: MessageKey
  tabs: AttendanceTab[] | null
  href?: string
}

export const ATTENDANCE_GROUPS: AttendanceGroup[] = [
  { id: 'students', labelKey: 'attendance.groupStudents', tabs: ATTENDANCE_STUDENT_TABS },
  { id: 'employees', labelKey: 'attendance.groupEmployees', tabs: ATTENDANCE_EMPLOYEE_TABS },
  { id: 'off-days', labelKey: 'attendance.tabOffDays', tabs: null, href: '/school/attendance/off-days' },
  { id: 'machine', labelKey: 'attendance.groupMachine', tabs: ATTENDANCE_MACHINE_TABS },
]

/** The route a sidebar/parent link for this Attendance group opens — its
 *  first tab, or its own href for the tab-less Off-Days group. */
export function attendanceGroupHref(id: AttendanceGroup['id']): string {
  const group = ATTENDANCE_GROUPS.find((g) => g.id === id)!
  return group.tabs ? group.tabs[0].href : group.href!
}

/** Every route this group's sidebar link should read as "active" for — not
 *  just its default (first-tab) href. Students/Employees each cover several
 *  unrelated paths (mark/book/student-log/leave/student, say) with no shared
 *  URL prefix, so a plain prefix match on the default href alone would only
 *  highlight the sidebar entry while on that one tab and go dark on the
 *  other three, disagreeing with AttendanceTabs' own activeGroup logic. */
export function attendanceGroupTabHrefs(id: AttendanceGroup['id']): string[] {
  const group = ATTENDANCE_GROUPS.find((g) => g.id === id)!
  return group.tabs ? group.tabs.map((tab) => tab.href) : [group.href!]
}
