'use server'

import { revalidatePath } from 'next/cache'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { parseCouponValue } from '@/lib/super-admin/coupons'
import { pgErrorMessage } from '@/lib/crud/pg-error'

// Coupon CRUD (#291) — replicates the #288 write-pattern: thin action → pure
// helper → RLS-guarded write ("super admin manages discounts").
export async function createCoupon(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getSuperAdminContext()
  const code = String(formData.get('code') ?? '').trim().toUpperCase()
  const scope = String(formData.get('scope') ?? 'subscription').trim() || 'subscription'
  const discountType = String(formData.get('discount_type') ?? '') as 'percent' | 'flat'
  const expiresAt = String(formData.get('expires_at') ?? '').trim()
  if (!code) return { error: 'Code is required.' }
  if (discountType !== 'percent' && discountType !== 'flat') return { error: 'Pick a discount type.' }

  const value = parseCouponValue(discountType, String(formData.get('value') ?? ''))
  if (value === null) return { error: 'Invalid value for the chosen type.' }

  const { error } = await supabase.from('discounts').insert({
    code,
    scope,
    discount_type: discountType,
    value,
    ...(expiresAt ? { expires_at: expiresAt } : {}),
  })
  if (error) return { error: pgErrorMessage(error, { '23505': 'That code already exists.' }) }
  revalidatePath('/super-admin/coupons')
  return {}
}

export async function setCouponActive(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getSuperAdminContext()
  const code = String(formData.get('code') ?? '')
  const active = String(formData.get('active') ?? '') === 'true'
  const { error } = await supabase.from('discounts').update({ active }).eq('code', code)
  if (error) return { error: pgErrorMessage(error) }
  revalidatePath('/super-admin/coupons')
  return {}
}

export async function deleteCoupon(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getSuperAdminContext()
  const code = String(formData.get('code') ?? '')
  const { error } = await supabase.from('discounts').delete().eq('code', code)
  if (error) return { error: pgErrorMessage(error) }
  revalidatePath('/super-admin/coupons')
  return {}
}
