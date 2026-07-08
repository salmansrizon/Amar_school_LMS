'use server'

import { revalidatePath } from 'next/cache'
import { requireSuperAdmin } from '@/lib/auth/require-role'
import { createClient } from '@/lib/supabase/server'

export async function generateBatch(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient()
  if (!(await requireSuperAdmin(supabase))) return { error: 'Unauthorized' }
  const { error } = await supabase.rpc('generate_code_batch', {
    batch_count: Number(formData.get('count')),
    validity_months: Number(formData.get('validity')),
    code_price: Number(formData.get('price')),
  })
  if (error) return { error: error.message }
  revalidatePath('/super-admin/codes')
  return {}
}

export async function deleteCode(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  if (!(await requireSuperAdmin(supabase))) return { error: 'Unauthorized' }
  const { error } = await supabase.from('subscription_codes').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/super-admin/codes')
  return {}
}

export async function redeemCode(sid: string, code: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  if (!(await requireSuperAdmin(supabase))) return { error: 'Unauthorized' }
  const { error } = await supabase.rpc('redeem_code', { code_text: code.trim(), sid })
  if (error) return { error: error.message }
  revalidatePath('/super-admin/schools')
  return {}
}

export async function decreaseExpiry(sid: string, months: number): Promise<{ error?: string }> {
  const supabase = await createClient()
  if (!(await requireSuperAdmin(supabase))) return { error: 'Unauthorized' }
  const { error } = await supabase.rpc('decrease_expiry', { sid, months })
  if (error) return { error: error.message }
  revalidatePath('/super-admin/schools')
  return {}
}
