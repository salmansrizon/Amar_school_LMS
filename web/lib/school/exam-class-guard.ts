import type { SupabaseClient } from '@supabase/supabase-js'
import { t } from '@/lib/i18n'
import { currentLang } from '@/lib/i18n-server'
import { classScopeFor } from '@/lib/school/class-scope'

/** May the caller act on this exam, given the class it belongs to? (#676)
 *
 *  ADR 0021: a class attachment is a ceiling on a Grant. The `exams` RLS policy
 *  only asks for the Exams grant, so a Class Teacher of one class could publish,
 *  edit, close and delete another class's exam. This is the same question the
 *  students policy already asks, put to the exam's class instead of a student's,
 *  and it reuses the two definer functions that own the answer rather than
 *  walking `class_offerings` / `routine_slots` here (both are grant-gated, so a
 *  teacher cannot read her own attachment — see class-scope.ts):
 *
 *  - `app_class_scope` (0163): the Owner and office staff are 'school-wide' and
 *    are never narrowed.
 *  - `staff_capacity_for_class_offering` (0180): the caller's capacity over one
 *    Class Offering.
 *
 *  An exam with no class yet (every exam starts that way) has nothing to narrow
 *  by. `targetClassId` is the class a save would move the exam TO: it is checked
 *  as well, so a teacher cannot re-point an exam at a class she does not hold.
 *
 *  ponytail: action-layer guard only. A direct PostgREST write still passes the
 *  `exams` policy; closing that needs the RLS migration #676 proposes. */
export async function mayActOnExamClass(
  supabase: SupabaseClient,
  examId: string,
  targetClassId: string | null = null,
): Promise<boolean> {
  if ((await classScopeFor(supabase)) === 'school-wide') return true

  const { data: exam } = await supabase.from('exams').select('class_id').eq('id', examId).maybeSingle()
  // Not found or not readable: the action's own query reports that, as today.
  if (!exam) return true

  for (const classId of new Set([exam.class_id as string | null, targetClassId])) {
    if (!classId) continue
    const { data: capacity } = await supabase.rpc('staff_capacity_for_class_offering', { p_offering: classId })
    // Class Teacher or Subject Teacher of the class. Whether publishing should
    // be Class Teacher only is #676's open question; tighten here if so.
    if (!capacity) return false
  }
  return true
}

/** The action-shaped form: `null` when allowed, else the localized error result
 *  an exam server action returns as-is. */
export async function examClassDenied(
  supabase: SupabaseClient,
  examId: string,
  targetClassId: string | null = null,
): Promise<{ error: string } | null> {
  if (await mayActOnExamClass(supabase, examId, targetClassId)) return null
  return { error: t('exams.notYourClass', await currentLang()) }
}
