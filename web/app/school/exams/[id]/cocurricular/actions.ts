'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// RLS + enforce_cocurricular_mark_school (same-school tenancy, Closed-exam
// guard, migration 0052) are the authority here — mirrors marks-entry's
// saveMarks: one bulk upsert covering the whole grid per Save click.

function pagePath(examId: string): string {
  return `/school/exams/${examId}/cocurricular`
}

export interface CocurricularMarkRow {
  studentId: string
  itemId: string
  checked: boolean
}

export async function saveCocurricularMarks(
  examId: string,
  rows: CocurricularMarkRow[],
): Promise<{ error?: string }> {
  if (!rows.length) return {}
  const supabase = await createClient()

  const payload = rows.map((r) => ({
    exam_id: examId,
    student_id: r.studentId,
    item_id: r.itemId,
    checked: r.checked,
  }))

  const { error } = await supabase
    .from('cocurricular_checklist_marks')
    .upsert(payload, { onConflict: 'exam_id,student_id,item_id' })
  if (error) return { error: error.message }
  revalidatePath(pagePath(examId))
  return {}
}
