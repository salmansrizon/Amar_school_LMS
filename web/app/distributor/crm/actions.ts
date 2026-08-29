'use server'

import { revalidatePath } from 'next/cache'
import { getDistributorContext } from '@/lib/distributor/context'
import { isLeadStage } from '@/lib/distributor/leads'
import { pgErrorMessage } from '@/lib/crud/pg-error'

export async function createLead(formData: FormData): Promise<{ error?: string }> {
  const { supabase, userId } = await getDistributorContext()
  const school_name = String(formData.get('school_name') ?? '').trim()
  if (!school_name) return { error: 'School name is required.' }

  const { error } = await supabase.from('leads').insert({
    distributor_id: userId,
    school_name,
    contact_name: String(formData.get('contact_name') ?? '').trim() || null,
    contact_phone: String(formData.get('contact_phone') ?? '').trim() || null,
  })
  if (error) return { error: pgErrorMessage(error) }
  revalidatePath('/distributor/crm')
  return {}
}

export async function setLeadStage(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getDistributorContext()
  const id = String(formData.get('id') ?? '')
  const stage = String(formData.get('stage') ?? '')
  if (!isLeadStage(stage)) return { error: 'Invalid stage.' }

  // RLS restricts the update to the caller's own leads.
  const { error } = await supabase
    .from('leads')
    .update({ stage, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: pgErrorMessage(error) }
  revalidatePath('/distributor/crm')
  revalidatePath(`/distributor/crm/${id}`)
  return {}
}
