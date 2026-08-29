'use server'

import { revalidatePath } from 'next/cache'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { takaToPoisha } from '@/lib/money'
import { parseSegments } from '@/lib/super-admin/sms-packages'
import { pgErrorMessage } from '@/lib/crud/pg-error'

// SMS package + rate CRUD (#296). Uses the shared CRUD helpers (arch pass): pure
// parsers + pgErrorMessage. RLS: "super admin manages sms_packages / _rate_config".
export async function createPackage(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getSuperAdminContext()
  const name = { bn: String(formData.get('name_bn') ?? ''), en: String(formData.get('name_en') ?? '') }
  const segments = parseSegments(String(formData.get('segments') ?? ''))
  const price = takaToPoisha(String(formData.get('price') ?? ''))
  if (!name.en && !name.bn) return { error: 'Package name is required.' }
  if (segments === null) return { error: 'Segments must be a positive whole number.' }
  if (price === null) return { error: 'Price must be a positive amount.' }

  const { error } = await supabase.from('sms_packages').insert({ name, segments, price })
  if (error) return { error: pgErrorMessage(error) }
  revalidatePath('/super-admin/sms-commerce')
  return {}
}

export async function setPackageActive(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getSuperAdminContext()
  const id = String(formData.get('id') ?? '')
  const active = String(formData.get('active') ?? '') === 'true'
  const { error } = await supabase.from('sms_packages').update({ active }).eq('id', id)
  if (error) return { error: pgErrorMessage(error) }
  revalidatePath('/super-admin/sms-commerce')
  return {}
}

export async function deletePackage(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getSuperAdminContext()
  const id = String(formData.get('id') ?? '')
  const { error } = await supabase.from('sms_packages').delete().eq('id', id)
  if (error) return { error: pgErrorMessage(error) }
  revalidatePath('/super-admin/sms-commerce')
  return {}
}

export async function setRate(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getSuperAdminContext()
  const route = String(formData.get('route') ?? '')
  const amount = takaToPoisha(String(formData.get('amount') ?? ''))
  if (route !== 'mask' && route !== 'non_mask') return { error: 'Invalid route.' }
  if (amount === null) return { error: 'Rate must be a positive amount.' }

  const { error } = await supabase.from('sms_rate_config').upsert({ route, amount })
  if (error) return { error: pgErrorMessage(error) }
  revalidatePath('/super-admin/sms-commerce')
  return {}
}
