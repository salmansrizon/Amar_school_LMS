'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// RLS scopes every write to the caller's School; the same-school tenancy
// trigger on student_subjects is the authority on cross-school references.
// Students are matched to a class by name+section (the legacy free-text
// shape — see migration 0022's note on why class linkage isn't a hard FK yet).

const PAGE = '/school/students/subject-assignment'

export async function bulkAssignSubjects(
  classId: string,
  subjectIds: string[],
  optionalSubjectIds: string[],
): Promise<{ error?: string; count?: number }> {
  if (!subjectIds.length) return { error: 'Pick at least one subject' }

  const supabase = await createClient()
  const { data: cls } = await supabase
    .from('classes')
    .select('id, name, section')
    .eq('id', classId)
    .maybeSingle()
  if (!cls) return { error: 'Class not found' }

  let query = supabase.from('students').select('id').eq('class_name', cls.name)
  query = cls.section ? query.eq('section', cls.section) : query.is('section', null)
  const { data: students } = await query
  if (!students?.length) return { error: 'No students in this class' }

  const optional = new Set(optionalSubjectIds)
  const rows = students.flatMap((s) =>
    subjectIds.map((subjectId) => ({
      student_id: s.id,
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
