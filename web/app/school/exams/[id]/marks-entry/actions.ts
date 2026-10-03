'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { markCellError, markRowState } from '@/lib/exam-setup'

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
export interface MarksEntryRow {
  studentId: string
  theory: string
  mcq: string
  practical: string
}

// entered_by (exam_marks.entered_by -> employees.id) is left null: there is
// no auth-user -> employees linkage anywhere in this codebase yet (profiles
// carry the school role, employees is a separate roster) — auth.uid() is not
// an employees.id, so setting it here would either violate the FK or silently
// misattribute the entry. Revisit once such a linkage exists.
//
// "Not entered" is the absence of a row (audit AC3): a student whose cells are
// all blank is not written, and is deleted if a row was saved before. Nothing
// is clamped — a mark above the subject's maximum, a negative one or a
// half-filled row is refused whole (`invalid`), the grid having already shown
// which cell. Re-checked here because the grid is not a trust boundary.
export async function saveMarks(
  examId: string,
  subjectId: string,
  rows: MarksEntryRow[],
): Promise<{ error?: string; invalid?: true }> {
  if (!rows.length) return {}
  const supabase = await createClient()

  const { data: subject } = await supabase
    .from('subjects')
    .select('theory_marks, mcq_marks, practical_marks')
    .eq('id', subjectId)
    .maybeSingle()
  if (!subject) return { error: 'Subject not found' }

  const upserts: Record<string, string | number>[] = []
  const cleared: string[] = []
  for (const r of rows) {
    const state = markRowState(r, subject)
    if (state === 'empty') {
      cleared.push(r.studentId)
      continue
    }
    const bad =
      state === 'partial' ||
      markCellError(r.theory, subject.theory_marks) ||
      markCellError(r.mcq, subject.mcq_marks) ||
      markCellError(r.practical, subject.practical_marks)
    if (bad) return { error: 'Invalid marks', invalid: true }
    upserts.push({
      exam_id: examId,
      subject_id: subjectId,
      student_id: r.studentId,
      // A component the subject does not have (max 0) is stored 0, as the
      // column requires; the row state above ignored it.
      theory_obtained: subject.theory_marks > 0 ? Number(r.theory) : 0,
      mcq_obtained: subject.mcq_marks > 0 ? Number(r.mcq) : 0,
      practical_obtained: subject.practical_marks > 0 ? Number(r.practical) : 0,
    })
  }

  if (upserts.length) {
    const { error } = await supabase
      .from('exam_marks')
      .upsert(upserts, { onConflict: 'exam_id,student_id,subject_id' })
    if (error) return { error: error.message }
  }
  if (cleared.length) {
    const { error } = await supabase
      .from('exam_marks')
      .delete()
      .eq('exam_id', examId)
      .eq('subject_id', subjectId)
      .in('student_id', cleared)
    if (error) return { error: error.message }
  }
  revalidatePath(pagePath(examId))
  return {}
}
