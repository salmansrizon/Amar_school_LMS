'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// RLS + enforce_exam_mark_school (same-school tenancy, Closed-exam guard,
// migration 0048) are the authority here — this action only shapes the
// per-student rows into one bulk upsert so a Save covers the whole subject
// column in one round trip, matching the mockup's single Save button for the
// entire table.

function pagePath(examId: string): string {
  return `/school/exams/${examId}/marks-entry`
}

export interface MarksEntryRow {
  studentId: string
  theory: number
  mcq: number
  practical: number
}

function clampMark(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0
}

// entered_by (exam_marks.entered_by -> employees.id) is left null: there is
// no auth-user -> employees linkage anywhere in this codebase yet (profiles
// carry the school role, employees is a separate roster) — auth.uid() is not
// an employees.id, so setting it here would either violate the FK or silently
// misattribute the entry. Revisit once such a linkage exists.
export async function saveMarks(
  examId: string,
  subjectId: string,
  rows: MarksEntryRow[],
): Promise<{ error?: string }> {
  if (!rows.length) return {}
  const supabase = await createClient()

  const payload = rows.map((r) => ({
    exam_id: examId,
    subject_id: subjectId,
    student_id: r.studentId,
    theory_obtained: clampMark(r.theory),
    mcq_obtained: clampMark(r.mcq),
    practical_obtained: clampMark(r.practical),
  }))

  const { error } = await supabase
    .from('exam_marks')
    .upsert(payload, { onConflict: 'exam_id,student_id,subject_id' })
  if (error) return { error: error.message }
  revalidatePath(pagePath(examId))
  return {}
}
