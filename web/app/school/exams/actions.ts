'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// RLS + the exam_close_immutable trigger are the authority. Exams II (issue
// #47) extends this file with exam setup (class/date/grading-scheme) and
// subject-teacher assignment; exam_refs_same_school / the closed-exam guard
// triggers on the child tables are the authority there too.

const PAGE = '/school/exams'

export async function addExam(formData: FormData): Promise<{ error?: string; id?: string }> {
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Name is required' }
  const year = Number(formData.get('exam_year'))
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return { error: 'Invalid year' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('exams')
    .insert({ name, exam_year: year })
    .select('id')
    .single()
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return { id: data.id }
}

export async function renameExam(id: string, name: string): Promise<{ error?: string }> {
  const trimmed = name.trim()
  if (!trimmed) return { error: 'Name is required' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('exams')
    .update({ name: trimmed })
    .eq('id', id)
    .select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Exam not found or not accessible' }
  revalidatePath(PAGE)
  return {}
}

/** Remove an exam that has not been closed (#551).
 *
 *  Only an OPEN exam. A Closed one stays undeletable — results are already out
 *  and CONTEXT.md calls closing irreversible — and the `exam_close_immutable`
 *  trigger (0037) is what enforces that, not this function.
 *
 *  Everything the exam owns goes with it: routine rows, seat plans, marks,
 *  subject teachers, co-curricular marks. That cascade used to fail on its own
 *  child guard, which read the already-deleted parent as "closed"; 0171 fixed
 *  it, which is what makes an exam deletable at all.
 */
export async function deleteExam(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('exams').delete().eq('id', id).select('id')
  if (error) {
    // The trigger raises in English; the operator reads Bangla, and "a Closed
    // exam cannot be deleted" is a rule rather than a fault.
    if (/closed/i.test(error.message)) return { error: 'closed' }
    return { error: error.message }
  }
  if (!data?.length) return { error: 'not-found' }
  revalidatePath(PAGE)
  return {}
}

export async function closeExam(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('close_exam', { exam: id })
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return {}
}
