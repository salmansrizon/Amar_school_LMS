import type { SupabaseClient } from '@supabase/supabase-js'
import { attendanceRate } from '@/lib/dashboard'

// Attendance Rate (CONTEXT.md) for every Student the caller can read, counted
// in the database by student_attendance_summary() (migration 0217). RLS-scoped:
// the function is security invoker. One row per Student, so a school is a few
// 1000-row pages (the REST cap).
//
// Returns null while 0217 is unapplied (function missing), so a page can hide
// the column instead of showing zeros.
const PAGE = 1000

export interface AttendanceRateRow {
  present: number
  schoolDays: number
  /** Percent, 1 dp; null when the school has taken no attendance in the window. */
  rate: number | null
}

function missingFunction(error: { code?: string } | null): boolean {
  return error?.code === 'PGRST202' || error?.code === '42883'
}

function row(present: number, schoolDays: number): AttendanceRateRow {
  return { present, schoolDays, rate: schoolDays > 0 ? attendanceRate(present, schoolDays) : null }
}

/** `since` (YYYY-MM-DD): count from that day (month to date on the mark page,
 *  migration 0261). Without it: the Academic Year so far (0217). Null while the
 *  function asked for is missing. */
export async function studentAttendanceRates(
  supabase: SupabaseClient,
  since?: string,
): Promise<Map<string, AttendanceRateRow> | null> {
  const out = new Map<string, AttendanceRateRow>()
  for (let from = 0; ; from += PAGE) {
    const call = since
      ? supabase.rpc('student_attendance_summary_since', { p_from: since })
      : supabase.rpc('student_attendance_summary')
    const { data, error } = await call
      .order('student_id')
      .range(from, from + PAGE - 1)
    if (missingFunction(error)) return null
    if (error) throw error
    for (const r of data ?? []) out.set(r.student_id, row(Number(r.present_days), Number(r.school_days)))
    if (!data || data.length < PAGE) break
  }
  return out
}

/** School-wide, Student-day weighted. Null while 0217 is unapplied. */
export async function schoolAttendanceRate(supabase: SupabaseClient): Promise<AttendanceRateRow | null> {
  const { data, error } = await supabase.rpc('school_attendance_summary').single()
  if (missingFunction(error)) return null
  if (error) throw error
  const r = data as { present_days: number; school_days: number }
  return row(Number(r.present_days), Number(r.school_days))
}
