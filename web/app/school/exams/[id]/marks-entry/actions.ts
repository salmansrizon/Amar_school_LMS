'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { examMarksDenied } from '@/lib/school/exam-class-guard'
import { buildMarksSave, isMissingFunctionError, type MarksEntryInput } from '@/lib/exam-marks-save'

// RLS + enforce_exam_mark_school (same-school tenancy, Closed-exam guard,
// migration 0048) are the authority here — this action only shapes the
// per-student rows into one bulk upsert so a Save covers the whole subject
// column in one round trip, matching the mockup's single Save button for the
// entire table.

function pagePath(examId: string): string {
  return `/school/exams/${examId}/marks-entry`
}

/** One student's typed marks, as text: a blank component means "not entered",
 * which a number could not say. */
export type MarksEntryRow = MarksEntryInput

// entered_by (exam_marks.entered_by -> employees.id) is left null: there is
// no auth-user -> employees linkage anywhere in this codebase yet (profiles
// carry the school role, employees is a separate roster) — auth.uid() is not
// an employees.id, so setting it here would either violate the FK or silently
// misattribute the entry. Revisit once such a linkage exists.
//
// "Not entered" is the absence of a row (audit AC3): a student whose cells are
// all blank is not written, and is deleted if a row was saved before. Nothing
// is clamped — a mark above the subject's maximum or a negative one is refused
// whole (`invalid`), the grid having already shown which cell. Re-checked here
// because the grid is not a trust boundary.
//
// One save is one transaction (#700): save_exam_marks() (migration 0223) does
// the upsert and the delete together. The same migration lets a row be absent
// or half-filled (#679). While it is not applied the function is missing, and
// the save is what it was: two statements, an absent or half-filled row refused.
export async function saveMarks(
  examId: string,
  subjectId: string,
  rows: MarksEntryRow[],
): Promise<{ error?: string; invalid?: true }> {
  if (!rows.length) return {}
  const supabase = await createClient()
  const denied = await examMarksDenied(supabase, examId, subjectId)
  if (denied) return denied

  const { data: subject } = await supabase
    .from('subjects')
    .select('theory_marks, mcq_marks, practical_marks')
    .eq('id', subjectId)
    .maybeSingle()
  if (!subject) return { error: 'Subject not found' }

  const save = buildMarksSave(rows, subject)
  if (save.invalid) return { error: 'Invalid marks', invalid: true }

  const { error: rpcError } = await supabase.rpc('save_exam_marks', {
    p_exam: examId,
    p_subject: subjectId,
    p_rows: save.rows,
    p_cleared: save.cleared,
  })
  if (rpcError && !isMissingFunctionError(rpcError)) return { error: rpcError.message }

  if (rpcError) {
    // Migration 0223 not applied: the components are NOT NULL and there is no
    // absent flag, so such a row cannot be stored.
    if (save.needsMigration) return { error: 'Invalid marks', invalid: true }
    if (save.rows.length) {
      const { error } = await supabase.from('exam_marks').upsert(
        save.rows.map((r) => ({
          exam_id: examId,
          subject_id: subjectId,
          student_id: r.student_id,
          theory_obtained: r.theory,
          mcq_obtained: r.mcq,
          practical_obtained: r.practical,
        })),
        { onConflict: 'exam_id,student_id,subject_id' },
      )
      if (error) return { error: error.message }
    }
    if (save.cleared.length) {
      const { error } = await supabase
        .from('exam_marks')
        .delete()
        .eq('exam_id', examId)
        .eq('subject_id', subjectId)
        .in('student_id', save.cleared)
      if (error) return { error: error.message }
    }
  }
  revalidatePath(pagePath(examId))
  return {}
}
