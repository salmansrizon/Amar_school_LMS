'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// RLS ("school members manage cocurricular_items" scoped to
// app_current_school_id(), migration 0052) is the authority on tenancy here —
// this action only validates input and shapes the insert.

const PAGE = '/school/exams/cocurricular-items'

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? '').trim()
}

export async function addCocurricularItem(formData: FormData): Promise<{ error?: string }> {
  const label = str(formData, 'label')
  if (!label) return { error: 'Label is required' }
  const sortOrder = Number(formData.get('sort_order'))

  const supabase = await createClient()
  const { error } = await supabase.from('cocurricular_items').insert({
    label,
    sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
  })
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return {}
}

export async function removeCocurricularItem(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('cocurricular_items').delete().eq('id', id).select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Item not found or not accessible' }
  revalidatePath(PAGE)
  return {}
}
