'use server'

import { revalidatePath } from 'next/cache'
import { requireSuperAdmin } from '@/lib/auth/require-role'
import { createClient } from '@/lib/supabase/server'

// Central off-day template management (map #158, ticket #166).

/** Add (or replace by date) a central off-day. */
export async function addCentralOffDay(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient()
  if (!(await requireSuperAdmin(supabase))) return { error: 'Unauthorized' }

  const day = String(formData.get('day') ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { error: 'invalid date' }
  const { error } = await supabase.from('central_off_days').upsert(
    {
      day,
      label_bn: String(formData.get('label_bn') ?? '').trim() || null,
      label_en: String(formData.get('label_en') ?? '').trim() || null,
    },
    { onConflict: 'day' },
  )
  if (error) return { error: error.message }
  revalidatePath('/super-admin/off-days')
  return {}
}

export async function deleteCentralOffDay(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  if (!(await requireSuperAdmin(supabase))) return { error: 'Unauthorized' }
  const { error } = await supabase.from('central_off_days').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/super-admin/off-days')
  return {}
}
