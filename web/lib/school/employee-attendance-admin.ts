import { cache } from 'react'
import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSchoolContext } from '@/lib/school/context'
import { ATTENDANCE_GROUPS, type AttendanceGroup } from '@/lib/attendance-nav'
import { t } from '@/lib/i18n'
import { currentLang } from '@/lib/i18n-server'

// Employee attendance administration (#677).
//
// The Attendance grant gates the whole /school/attendance segment (ADR 0020,
// ADR 0029), so a Class Teacher who holds it for her own register could also
// manage attendance machines, Grace Time, Office Hour, the employee calendar
// and employee leave for the whole School.
//
// Decision taken (conservative, reversible): those five areas stay inside the
// Attendance grant for the School Owner and for office staff, and are refused
// to a Staff User who has an `employees` row (a teacher). It is ADR 0021's
// signal, reused: an Employee is narrowed, office staff are not. No new
// permission key, so nobody has to be re-granted.
//
// To reverse: make `mayAdministerEmployeeAttendance` return true and do not
// apply (or roll back) migration 0240.

/** The Attendance areas a teacher is refused: everything about employees and
 *  machines. Students and the Off-Day Calendar stay. */
const ADMIN_GROUPS: readonly AttendanceGroup['id'][] = ['employees', 'machine']

/** Pure: the Attendance areas this caller sees in the area row. */
export function attendanceGroupsFor(isAdmin: boolean): AttendanceGroup[] {
  return isAdmin ? ATTENDANCE_GROUPS : ATTENDANCE_GROUPS.filter((g) => !ADMIN_GROUPS.includes(g.id))
}

/** Pure: is this route one of the employee-administration pages? */
export function isEmployeeAttendanceAdminPath(pathname: string): boolean {
  return ATTENDANCE_GROUPS.some(
    (g) => ADMIN_GROUPS.includes(g.id) && (g.tabs ?? []).some((tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`)),
  )
}

/** Pure: the rule itself. `scope` is `app_class_scope()`'s answer (0163):
 *  'school-wide' is the Owner or office staff. Anything else — including an
 *  RPC failure, passed as null — refuses. */
export function scopeAdministersEmployeeAttendance(scope: unknown): boolean {
  return scope === 'school-wide'
}

/** May the caller administer employee attendance? Fails closed.
 *
 *  Uses `app_class_scope` (0163) rather than reading `employees`: that table is
 *  grant-gated, so a teacher cannot read her own row (see class-scope.ts). The
 *  Attendance grant itself is checked by the proxy and by RLS. */
export async function mayAdministerEmployeeAttendance(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc('app_class_scope')
  return !error && scopeAdministersEmployeeAttendance(data)
}

/** Per-request answer for pages and the tab bar. The Owner costs no query. */
export const isEmployeeAttendanceAdmin = cache(async (): Promise<boolean> => {
  const { supabase, role } = await getSchoolContext()
  return role === 'school_owner' || mayAdministerEmployeeAttendance(supabase)
})

/** Page guard: a refused caller goes to the designed refusal page (#538). */
export async function requireEmployeeAttendanceAdmin(from: string): Promise<void> {
  if (!(await isEmployeeAttendanceAdmin())) {
    redirect(`/school/permission-denied?from=${encodeURIComponent(from)}`)
  }
}

/** Action guard: `null` when allowed, else the localized error to return. */
export async function employeeAttendanceAdminDenied(supabase: SupabaseClient): Promise<{ error: string } | null> {
  if (await mayAdministerEmployeeAttendance(supabase)) return null
  return { error: t('denied.title', await currentLang()) }
}
