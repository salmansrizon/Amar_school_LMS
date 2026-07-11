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

  // The RLS-scoped lookup only sees this school's people, so a cross-school id
  // fails here with a clear error (composite FKs in 0020 enforce it in the DB).
  const { data: holderRow } = await supabase
    .from(kind === 'student' ? 'students' : 'employees')
    .select('id')
    .eq('id', id)
    .maybeSingle()
  if (!holderRow) return { error: 'Holder not found' }

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

// Per-school manual-attendance override switch (issue #30, PRD §5.3: preserve
// the legacy "de-activate automatic attendance" toggle). Switching off stops
// reconcile_attendance from touching this School's raw taps (migration
// 0047); the school then relies fully on save_student_attendance-style
// manual marking. RPC does its own role check same as set_school_default_grace.
export async function setAutomaticAttendance(enabled: boolean): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_automatic_attendance_enabled', { enabled })
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return {}
}
