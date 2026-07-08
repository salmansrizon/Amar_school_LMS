'use server'

import { revalidatePath } from 'next/cache'
import { requireSchoolMember } from '@/lib/auth/require-role'
import { createClient } from '@/lib/supabase/server'

const PAGE = '/school/attendance'

export async function assignCard(formData: FormData): Promise<{ error?: string }> {
  const cardNumber = String(formData.get('card_number') ?? '').trim()
  if (!cardNumber) return { error: 'Card number is required' }
  const holder = String(formData.get('holder') ?? '') // "student:<id>" | "employee:<id>"
  const [kind, id] = holder.split(':')
  if (!id || (kind !== 'student' && kind !== 'employee')) return { error: 'Holder is required' }

  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return { error: 'Unauthorized' }
  const { error } = await supabase.from('rfid_cards').insert({
    card_number: cardNumber,
    student_id: kind === 'student' ? id : null,
    employee_id: kind === 'employee' ? id : null,
  })
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return {}
}

export async function removeCard(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return { error: 'Unauthorized' }
  const { data, error } = await supabase.from('rfid_cards').delete().eq('id', id).select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Card not found or not accessible' }
  revalidatePath(PAGE)
  return {}
}
