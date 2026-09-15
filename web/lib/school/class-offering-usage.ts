import type { SupabaseClient } from '@supabase/supabase-js'

/** Whether a Class Offering has ever been used (ADR 0024) — student
 *  enrollment, subjects, fee structures, routine, syllabus, exams, exam
 *  combinations, or publication targeting. Thin wrapper over the SECURITY
 *  DEFINER `class_offering_is_used` SQL function (migration 0202), so the
 *  check is correct regardless of the caller's own per-screen grants (Fees,
 *  Exams, etc. can each be gated independently — see CONTEXT.md's Permission
 *  Grant entry) rather than a false "unused" from an RLS-empty read. */
export async function classOfferingIsUsed(supabase: SupabaseClient, classOfferingId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('class_offering_is_used', { p_class_offering_id: classOfferingId })
  if (error) throw error
  return Boolean(data)
}

/** Every used Class Offering id in the caller's own School — the list-view
 *  twin of `classOfferingIsUsed`, one round trip instead of N. Backs the
 *  Class & Curriculum list's Delete-vs-Archive button choice per row. */
export async function usedClassOfferingIds(supabase: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await supabase.rpc('class_offerings_used_ids')
  if (error) throw error
  return new Set((data ?? []).map((row: { class_offering_id: string }) => row.class_offering_id))
}
