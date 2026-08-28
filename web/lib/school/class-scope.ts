import type { SupabaseClient } from '@supabase/supabase-js'

/** Why a Staff User's student list is empty.
 *
 *  - `none`        — the caller is an Employee with no class attachment at all.
 *  - `attached`    — the caller has at least one class; the list is genuinely empty.
 *  - `school-wide` — the Owner, or office staff with no employees row.
 */
export type ClassScope = 'none' | 'attached' | 'school-wide'

/** Resolve the caller's class scope, for explaining an empty student list.
 *
 *  0160 narrows every student-shaped read to the caller's class attachment, and
 *  an Employee with no attachment now reads no students at all. That is the
 *  intended answer, but on its own it renders as "No students yet" in a school
 *  with hundreds — which reads as a broken product rather than a missing
 *  assignment. This tells the screen which sentence to show.
 *
 *  Deliberately called only when the list came back empty, rather than folded
 *  into `getSchoolContext`: it is two queries, and every non-empty list — the
 *  overwhelming majority — needs neither. */
export async function classScopeFor(supabase: SupabaseClient, userId: string): Promise<ClassScope> {
  const { data: employee } = await supabase
    .from('employees')
    .select('id')
    .eq('profile_id', userId)
    .is('archived_at', null)
    .maybeSingle()

  // No employees row is this codebase's definition of office staff (0152), and
  // 0160 leaves them the whole school.
  if (!employee) return 'school-wide'

  const [{ count: asClassTeacher }, { count: asSubjectTeacher }] = await Promise.all([
    supabase.from('classes').select('id', { count: 'exact', head: true }).eq('class_teacher_id', employee.id),
    supabase.from('routine_slots').select('id', { count: 'exact', head: true }).eq('teacher_id', employee.id),
  ])

  return (asClassTeacher ?? 0) + (asSubjectTeacher ?? 0) > 0 ? 'attached' : 'none'
}
