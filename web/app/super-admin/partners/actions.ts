'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function createVendorUser(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('create_vendor_user', {
    user_email: String(formData.get('email')),
    user_password: String(formData.get('password')),
    user_full_name: String(formData.get('full_name')),
    user_role: String(formData.get('role')),
  })
  if (error) return { error: error.message }
  revalidatePath('/super-admin/partners')
  return {}
}

export async function addAssignment(formData: FormData): Promise<{ error?: string }> {
  const assignee = String(formData.get('assignee_id'))
  const locationId = String(formData.get('location_id') ?? '')
  const schoolId = String(formData.get('school_id') ?? '')
  const tier = String(formData.get('tier') ?? '')
  const supabase = await createClient()
  const { error } = await supabase.from('territory_assignments').insert({
    assignee_id: assignee,
    location_id: locationId || null,
    school_id: schoolId || null,
    tier: tier || null,
  })
  if (error) return { error: error.message }
  revalidatePath(`/super-admin/partners/${assignee}`)
  return {}
}

export async function removeAssignment(id: string, assignee: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('territory_assignments').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`/super-admin/partners/${assignee}`)
  return {}
}
