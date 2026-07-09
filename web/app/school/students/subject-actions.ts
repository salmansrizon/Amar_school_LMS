'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// RLS + the same-school trigger are the authority; these actions shape input and
// translate the bulk case (assign one subject to every student in a class).

export async function assignStudentSubject(
  studentId: string,
  subjectId: string,
  isOptional: boolean,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('student_subjects')
    .upsert(
      { student_id: studentId, subject_id: subjectId, is_optional: isOptional },
      { onConflict: 'student_id,subject_id' },
    )
  if (error) return { error: error.message }
  revalidatePath(`/school/students/${studentId}`)
  return {}
}

export async function removeStudentSubject(studentId: string, subjectId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('student_subjects')
    .delete()
    .eq('student_id', studentId)
    .eq('subject_id', subjectId)
  if (error) return { error: error.message }
  revalidatePath(`/school/students/${studentId}`)
  return {}
}

/** Assign one subject to every (non-archived) student in a class. */
export async function bulkAssignClassSubject(formData: FormData): Promise<{ error?: string; count?: number }> {
  const className = String(formData.get('class_name') ?? '').trim()
  const subjectId = String(formData.get('subject_id') ?? '').trim()
  const isOptional = formData.get('is_optional') != null
  if (!className) return { error: 'Choose a class' }
  if (!subjectId) return { error: 'Choose a subject' }

  const supabase = await createClient()
  const { data: students, error: selErr } = await supabase
    .from('students')
    .select('id')
    .eq('class_name', className)
    .is('archived_at', null)
  if (selErr) return { error: selErr.message }
  if (!students?.length) return { error: 'No active students in that class' }

  const rows = students.map((s) => ({ student_id: s.id, subject_id: subjectId, is_optional: isOptional }))
  // A class-wide assignment is authoritative: students who already have the
  // subject get the chosen compulsory/optional flag applied (not skipped), so the
  // reported count matches reality.
  const { error } = await supabase
    .from('student_subjects')
    .upsert(rows, { onConflict: 'student_id,subject_id' })
  if (error) return { error: error.message }
  revalidatePath('/school/students/subject-assignment')
  return { count: students.length }
}
