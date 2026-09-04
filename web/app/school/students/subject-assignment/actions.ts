'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// RLS scopes every write to the caller's School; the same-school tenancy
// trigger on student_subjects is the authority on cross-school references.
// Students are matched to a class via student_enrollments.class_offering_id
// (map #568/#582's Wave 3, issue #586) — not the old class_name/section
// free-text match (migration 0022's note on why class linkage wasn't a hard
// FK on `students` predates the Enrollment model and no longer applies here).

const PAGE = '/school/students/subject-assignment'

export async function bulkAssignSubjects(
  classId: string,
  subjectIds: string[],
  optionalSubjectIds: string[],
): Promise<{ error?: string; count?: number }> {
  if (!subjectIds.length) return { error: 'Pick at least one subject' }

  const supabase = await createClient()
  const { data: cls } = await supabase.from('class_offerings').select('id').eq('id', classId).maybeSingle()
  if (!cls) return { error: 'Class not found' }

  const { data: enrollments, error: enrollmentsError } = await supabase
    .from('student_enrollments')
    .select('student_id')
    .eq('class_offering_id', classId)
    .is('closed_at', null)
  if (enrollmentsError) return { error: enrollmentsError.message }
  if (!enrollments?.length) return { error: 'No students in this class' }

  const optional = new Set(optionalSubjectIds)
  const rows = enrollments.flatMap((e) =>
    subjectIds.map((subjectId) => ({
      student_id: e.student_id,
      subject_id: subjectId,
      is_optional: optional.has(subjectId),
    })),
  )
  const { error } = await supabase
    .from('student_subjects')
    .upsert(rows, { onConflict: 'student_id,subject_id' })
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return { count: rows.length }
}

export async function setStudentSubject(formData: FormData): Promise<{ error?: string }> {
  const studentId = String(formData.get('student_id') ?? '').trim()
  const subjectId = String(formData.get('subject_id') ?? '').trim()
  if (!studentId || !subjectId) return { error: 'Subject is required' }
  const isOptional = formData.get('is_optional') === 'on'

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
