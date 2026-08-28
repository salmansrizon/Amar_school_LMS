import type { SupabaseClient } from '@supabase/supabase-js'

/** Why a Staff User's student list is empty.
 *
 *  - `none`        — an Employee with no class attachment at all.
 *  - `attached`    — the caller has at least one class; the list is genuinely empty.
 *  - `school-wide` — the Owner, or office staff with no employees row.
 */
export type ClassScope = 'none' | 'attached' | 'school-wide'

/** Resolve the caller's class scope, for explaining an empty student list.
 *
 *  0160 narrows every student-shaped read to the caller's class attachment, and
 *  an Employee with no attachment reads no students at all. That is the intended
 *  answer, but on its own it renders as "No students yet" in a school with
 *  hundreds — a missing assignment reading as a broken product.
 *
 *  This must be one RPC and cannot be two table reads. An earlier version queried
 *  `employees` and `routine_slots` from here and was wrong in the one case it
 *  existed for: both tables are themselves grant-gated (`employees` behind
 *  app_module_granted('employees'), `routine_slots` behind `classes`, per 0136),
 *  so a Class Teacher holding neither got an empty result rather than an error.
 *  The code read that as "no employees row, therefore office staff, therefore the
 *  whole school" and printed "No students yet" to a teacher whose class was full.
 *  A caller cannot read their own attachment; only a definer function can
 *  (`app_class_scope`, 0163). */
export async function classScopeFor(supabase: SupabaseClient): Promise<ClassScope> {
  const { data } = await supabase.rpc('app_class_scope')
  return data === 'none' || data === 'attached' ? data : 'school-wide'
}
