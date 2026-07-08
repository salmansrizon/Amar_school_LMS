'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// RLS scopes everything to the caller's School; the 3-day lock trigger is the
// authority for edit rejection.

export async function addStudent(formData: FormData): Promise<{ error?: string }> {
  const name = String(formData.get('full_name') ?? '').trim()
  if (!name) return { error: 'Name is required' }
  const supabase = await createClient()
  const { error } = await supabase.from('students').insert({
    full_name: name,
    class_name: String(formData.get('class_name') ?? '').trim() || null,
    section: String(formData.get('section') ?? '').trim() || null,
  })
  if (error) return { error: error.message }
  revalidatePath('/school/students')
  return {}
}

export async function addBehaviourEntry(formData: FormData): Promise<{ error?: string }> {
  const studentId = String(formData.get('student_id'))
  const note = String(formData.get('note') ?? '').trim()
  if (!note) return { error: 'Note is required' }
  const supabase = await createClient()
  const { error } = await supabase.from('behaviour_log_entries').insert({
    student_id: studentId,
    note,
    rating: Number(formData.get('rating')),
    remind_date: String(formData.get('remind_date') ?? '') || null,
  })
  if (error) return { error: error.message }
  revalidatePath(`/school/students/${studentId}`)
  return {}
}

export async function updateBehaviourEntry(formData: FormData): Promise<{ error?: string }> {
  const id = String(formData.get('id'))
  const studentId = String(formData.get('student_id'))
  const note = String(formData.get('note') ?? '').trim()
  if (!note) return { error: 'Note is required' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('behaviour_log_entries')
    .update({ note, rating: Number(formData.get('rating')) })
    .eq('id', id)
    .select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'entry not updated' }
  revalidatePath(`/school/students/${studentId}`)
  return {}
}
