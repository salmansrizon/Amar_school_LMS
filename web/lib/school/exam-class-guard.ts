import type { SupabaseClient } from '@supabase/supabase-js'
import { t } from '@/lib/i18n'
import { currentLang } from '@/lib/i18n-server'

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
  return (await examClassCheck(supabase, examId, targetClassId)) === 'ok'
}

/** 'unverified' = `app_class_scope` itself errored and the caller could not be
 *  shown to be the Owner or office staff: refused, but not as "not your class". */
type ExamClassCheck = 'ok' | 'denied' | 'unverified'

async function examClassCheck(
  supabase: SupabaseClient,
  examId: string,
  targetClassId: string | null,
): Promise<ExamClassCheck> {
  // Fail closed. `classScopeFor` reads an RPC error as 'school-wide' — right for
  // explaining an empty list, wrong for a guard — so the RPC is asked directly
  // and anything but its three known answers refuses.
  const { data: scope, error: scopeError } = await supabase.rpc('app_class_scope')
  if (scopeError) {
    // The Owner and office staff have no employee row (same signal as
    // employee-attendance-admin.ts), so a clean "no employee" answer lets them
    // through without the failed scope call. A teacher has a row; an error here
    // too stays refused.
    const { data: me, error: meError } = await supabase.rpc('app_current_employee_id')
    return !meError && !me ? 'ok' : 'unverified'
  }
  if (scope === 'school-wide') return 'ok'
  if (scope !== 'attached' && scope !== 'none') return 'denied'

  const { data: exam } = await supabase.from('exams').select('class_id').eq('id', examId).maybeSingle()
  // Not found, not readable, or the read failed: refuse. Allowing here was only
  // safe while every guarded write hung off the exam row; promotion's writes go
  // to enrollments, so an unreadable or made-up exam id would walk past the
  // guard. Only narrowed callers reach this line — the Owner and office staff
  // returned above and still get the action's own not-found.
  if (!exam) return 'denied'

  for (const classId of new Set([exam.class_id as string | null, targetClassId])) {
    if (!classId) continue
    const { data: capacity } = await supabase.rpc('staff_capacity_for_class_offering', { p_offering: classId })
    // Class Teacher or Subject Teacher of the class. Whether publishing should
    // be Class Teacher only is #676's open question; tighten here if so.
    if (!capacity) return 'denied'
  }
  return 'ok'
}

/** The action-shaped form: `null` when allowed, else the localized error result
 *  an exam server action returns as-is. */
export async function examClassDenied(
  supabase: SupabaseClient,
  examId: string,
  targetClassId: string | null = null,
): Promise<{ error: string } | null> {
  const check = await examClassCheck(supabase, examId, targetClassId)
  if (check === 'ok') return null
  return { error: t(check === 'unverified' ? 'exams.permissionCheckFailed' : 'exams.notYourClass', await currentLang()) }
}

/** Marks entry asks one thing more: the teacher the exam itself names for this
 *  subject (`exam_subject_teachers`, set on Basic Info) may enter its marks even
 *  when she is not in that class's routine. Her own employee id comes from the
 *  definer function — `employees` is grant-gated, she cannot read her own row. */
export async function mayEnterExamMarks(supabase: SupabaseClient, examId: string, subjectId: string): Promise<boolean> {
  if (await mayActOnExamClass(supabase, examId)) return true
  const { data: me } = await supabase.rpc('app_current_employee_id')
  if (!me) return false
  const { data: assigned } = await supabase
    .from('exam_subject_teachers')
    .select('id')
    .eq('exam_id', examId)
    .eq('subject_id', subjectId)
    .eq('teacher_id', me)
    .maybeSingle()
  return Boolean(assigned)
}

export async function examMarksDenied(
  supabase: SupabaseClient,
  examId: string,
  subjectId: string,
): Promise<{ error: string } | null> {
  if (await mayEnterExamMarks(supabase, examId, subjectId)) return null
  return examClassDenied(supabase, examId)
}
