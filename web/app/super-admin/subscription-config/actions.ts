'use server'

import { revalidatePath } from 'next/cache'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { takaToPoisha } from '@/lib/money'
import { pgErrorMessage } from '@/lib/crud/pg-error'

// Subscription plans + pricing CRUD (#294). Shared CRUD helpers; RLS "super admin
// manages subscription_pricing / subscription_plans / plan_features".
export async function setPricing(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getSuperAdminContext()
  const base = takaToPoisha(String(formData.get('base_fee') ?? ''))
  const perStudent = takaToPoisha(String(formData.get('per_student_fee') ?? ''))
  if (base === null || perStudent === null) return { error: 'Fees must be positive amounts.' }

  const { error } = await supabase
    .from('subscription_pricing')
    .upsert({ singleton: true, base_fee: base, per_student_fee: perStudent })
  if (error) return { error: pgErrorMessage(error) }
  revalidatePath('/super-admin/subscription-config')
  return {}
}

export async function createPlan(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getSuperAdminContext()
  const key = String(formData.get('key') ?? '').trim().toLowerCase()
  const label = { bn: String(formData.get('label_bn') ?? ''), en: String(formData.get('label_en') ?? '') }
  const isDefault = String(formData.get('is_default') ?? '') === 'on'
  if (!key) return { error: 'Plan key is required.' }

  const { error } = await supabase.from('subscription_plans').insert({ key, label, is_default: isDefault })
  if (error) return { error: pgErrorMessage(error, { '23505': 'That plan key already exists.' }) }
  revalidatePath('/super-admin/subscription-config')
  return {}
}

export async function deletePlan(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getSuperAdminContext()
  const key = String(formData.get('key') ?? '')
  const { error } = await supabase.from('subscription_plans').delete().eq('key', key)
  if (error) return { error: pgErrorMessage(error, { '23503': 'A school is on this plan — reassign it first.' }) }
  revalidatePath('/super-admin/subscription-config')
  return {}
}

export async function setPlanFeature(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getSuperAdminContext()
  const planKey = String(formData.get('plan_key') ?? '')
  const featureKey = String(formData.get('feature_key') ?? '')
  const granted = String(formData.get('granted') ?? '') === 'true'
  if (!planKey || !featureKey) return { error: 'Missing plan or feature.' }

  const { error } = granted
    ? await supabase.from('plan_features').insert({ plan_key: planKey, feature_key: featureKey })
    : await supabase.from('plan_features').delete().eq('plan_key', planKey).eq('feature_key', featureKey)
  if (error && error.code !== '23505') return { error: pgErrorMessage(error) } // ignore already-granted
  revalidatePath('/super-admin/subscription-config')
  return {}
}
