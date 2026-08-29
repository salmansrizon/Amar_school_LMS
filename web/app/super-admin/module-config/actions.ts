'use server'

import { revalidatePath } from 'next/cache'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { pgErrorMessage } from '@/lib/crud/pg-error'

const STATES = ['active', 'disabled', 'trial', 'premium']
const P = '/super-admin/module-config'

export async function createModule(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getSuperAdminContext()
  const key = String(formData.get('key') ?? '').trim().toLowerCase()
  const label = { bn: String(formData.get('label_bn') ?? ''), en: String(formData.get('label_en') ?? '') }
  const sort = Number(formData.get('sort') ?? 0) || 0
  if (!key) return { error: 'Module key is required.' }
  const { error } = await supabase.from('modules').insert({ key, label, sort })
  if (error) return { error: pgErrorMessage(error, { '23505': 'That module key already exists.' }) }
  revalidatePath(P)
  return {}
}

export async function deleteModule(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getSuperAdminContext()
  const key = String(formData.get('key') ?? '')
  const { error } = await supabase.from('modules').delete().eq('key', key)
  if (error) return { error: pgErrorMessage(error) }
  revalidatePath(P)
  return {}
}

export async function createFeature(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getSuperAdminContext()
  const key = String(formData.get('key') ?? '').trim().toLowerCase()
  const moduleKey = String(formData.get('module_key') ?? '')
  const label = { bn: String(formData.get('label_bn') ?? ''), en: String(formData.get('label_en') ?? '') }
  const defaultState = String(formData.get('default_state') ?? 'active')
  if (!key || !moduleKey) return { error: 'Feature key and module are required.' }
  if (!STATES.includes(defaultState)) return { error: 'Invalid default state.' }
  const { error } = await supabase
    .from('features')
    .insert({ key, module_key: moduleKey, label, default_state: defaultState })
  if (error) return { error: pgErrorMessage(error, { '23505': 'That feature key already exists.' }) }
  revalidatePath(P)
  return {}
}

export async function deleteFeature(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getSuperAdminContext()
  const key = String(formData.get('key') ?? '')
  const { error } = await supabase.from('features').delete().eq('key', key)
  if (error) return { error: pgErrorMessage(error) }
  revalidatePath(P)
  return {}
}

export async function setFeatureState(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getSuperAdminContext()
  const key = String(formData.get('key') ?? '')
  const defaultState = String(formData.get('default_state') ?? '')
  if (!STATES.includes(defaultState)) return { error: 'Invalid state.' }
  const { error } = await supabase.from('features').update({ default_state: defaultState }).eq('key', key)
  if (error) return { error: pgErrorMessage(error) }
  revalidatePath(P)
  return {}
}

export async function addDependency(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getSuperAdminContext()
  const featureKey = String(formData.get('feature_key') ?? '')
  const dependsOn = String(formData.get('depends_on_key') ?? '')
  if (!featureKey || !dependsOn) return { error: 'Pick a dependency.' }
  if (featureKey === dependsOn) return { error: 'A feature cannot depend on itself.' }
  const { error } = await supabase
    .from('feature_dependencies')
    .insert({ feature_key: featureKey, depends_on_key: dependsOn })
  if (error) return { error: pgErrorMessage(error, { '23505': 'Already a dependency.' }) }
  revalidatePath(P)
  return {}
}

export async function removeDependency(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getSuperAdminContext()
  const featureKey = String(formData.get('feature_key') ?? '')
  const dependsOn = String(formData.get('depends_on_key') ?? '')
  const { error } = await supabase
    .from('feature_dependencies')
    .delete()
    .eq('feature_key', featureKey)
    .eq('depends_on_key', dependsOn)
  if (error) return { error: pgErrorMessage(error) }
  revalidatePath(P)
  return {}
}
