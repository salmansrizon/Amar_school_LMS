'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// RLS restricts all writes to super_admin.

export async function addLocation(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient()
  const parent = String(formData.get('parent_id') ?? '')
  const { error } = await supabase.from('locations').insert({
    name: String(formData.get('name')).trim(),
    type: String(formData.get('type')),
    parent_id: parent || null,
  })
  if (error) return { error: error.message }
  revalidatePath('/super-admin/locations')
  return {}
}

export async function deleteLocation(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('locations').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/super-admin/locations')
  return {}
}

export async function addCluster(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('clusters').insert({
    name: String(formData.get('name')).trim(),
    location_id: String(formData.get('location_id')),
  })
  if (error) return { error: error.message }
  revalidatePath('/super-admin/locations')
  return {}
}
