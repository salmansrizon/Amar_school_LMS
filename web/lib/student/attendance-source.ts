import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The days attendance was taken for the calling Student's class
 * (student_class_attendance_days, migration 0218).
 *
 * null whenever the answer is not usable: the function is missing (0218 not
 * applied), the call failed, or the reply is not a list. The caller then keeps
 * its behaviour from before 0218, so this optional call can never break a page.
 */
export async function classAttendanceDays(
  supabase: SupabaseClient,
  start: string,
  end: string,
): Promise<string[] | null> {
  const { data, error } = await supabase.rpc('student_class_attendance_days', { p_start: start, p_end: end })
  if (error || !Array.isArray(data)) return null
  // PostgREST returns a set of scalars as bare values; a one-column row is
  // accepted too, so a different wrapping cannot silently read as "no days".
  return (data as unknown[])
    .map((d) => (d && typeof d === 'object' ? Object.values(d)[0] : d))
    .filter((d): d is string => typeof d === 'string')
}
