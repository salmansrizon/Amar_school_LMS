import type { SupabaseClient } from '@supabase/supabase-js'
import { employeeTrackingStart } from '@/lib/employee-attendance-calendar'

// Each Employee's attendance start day (see employeeTrackingStart), for the
// Employee attendance pages. Asks employee_attendance_starts() (migration
// 0220), which answers for the School Owner AND any Staff User holding the
// attendance Permission Grant. While 0220 is unapplied — or if it returns
// nothing — falls back to today's direct read of `employees`, which only the
// School Owner can make (a granted non-owner gets no rows, so no clipping, as
// before). Same keep-working-before-the-migration pattern as
// attendance-rate-source.ts.

export type StartDayById = Map<string, string | null>

/** Pure: the function's answer is usable only when it is an error-free,
 *  non-empty list. Missing function (PGRST202 / 42883), any other error, or no
 *  rows all mean "read the table instead". */
export function shouldFallBackToEmployeesRead(
  error: { code?: string } | null,
  rows: readonly unknown[] | null,
): boolean {
  return !!error || !rows || rows.length === 0
}

export async function loadEmployeeAttendanceStarts(
  supabase: SupabaseClient,
  /** One Employee only (their own page); omit for the whole School. */
  employeeId?: string,
): Promise<StartDayById> {
  const { data, error } = await supabase.rpc('employee_attendance_starts')
  if (!shouldFallBackToEmployeesRead(error, data)) {
    const rows = data as { employee_id: string; start_day: string | null }[]
    return new Map(
      rows
        .filter((r) => !employeeId || r.employee_id === employeeId)
        .map((r) => [r.employee_id, r.start_day ? r.start_day.slice(0, 10) : null]),
    )
  }
  // employee_card hides joining_date on purpose; the base table is readable by
  // the Owner only, and no rows just means no start clip.
  let query = supabase.from('employees').select('id, joining_date, created_at').is('archived_at', null)
  if (employeeId) query = query.eq('id', employeeId)
  const { data: rows } = await query
  return new Map(
    (rows ?? []).map((e) => [e.id as string, employeeTrackingStart(e.joining_date, e.created_at)]),
  )
}
