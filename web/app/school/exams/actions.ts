'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// RLS + the exam_close_immutable trigger are the authority.

const PAGE = '/school/exams'

export async function addExam(formData: FormData): Promise<{ error?: string }> {
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Name is required' }
  const year = Number(formData.get('exam_year'))
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return { error: 'Invalid year' }
  const supabase = await createClient()
  const { error } = await supabase.from('exams').insert({ name, exam_year: year })
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return {}
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

export async function closeExam(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('close_exam', { exam: id })
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return {}
}
