'use server'

import { revalidatePath } from 'next/cache'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { nextSeq } from '@/lib/super-admin/workflows'
import { pgErrorMessage } from '@/lib/crud/pg-error'

const ROLES = ['super_admin', 'school_owner', 'staff_user', 'distributor', 'agent', 'gov_official']
const P = '/super-admin/workflows'

export async function createDefinition(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getSuperAdminContext()
  const key = String(formData.get('key') ?? '').trim().toLowerCase()
  const label = { bn: String(formData.get('label_bn') ?? ''), en: String(formData.get('label_en') ?? '') }
  if (!key) return { error: 'Workflow key is required.' }
  const { error } = await supabase.from('workflow_definitions').insert({ key, label, active: true })
  if (error) return { error: pgErrorMessage(error, { '23505': 'That workflow key already exists.' }) }
  revalidatePath(P)
  return {}
}

export async function setDefinitionActive(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getSuperAdminContext()
  const key = String(formData.get('key') ?? '')
  const active = String(formData.get('active') ?? '') === 'true'
  const { error } = await supabase.from('workflow_definitions').update({ active }).eq('key', key)
  if (error) return { error: pgErrorMessage(error) }
  revalidatePath(P)
  return {}
}

export async function deleteDefinition(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getSuperAdminContext()
  const key = String(formData.get('key') ?? '')
  const { error } = await supabase.from('workflow_definitions').delete().eq('key', key)
  if (error) return { error: pgErrorMessage(error, { '23503': 'This workflow has instances — cannot delete.' }) }
  revalidatePath(P)
  return {}
}

export async function createStage(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getSuperAdminContext()
  const definitionKey = String(formData.get('definition_key') ?? '')
  const name = { bn: String(formData.get('name_bn') ?? ''), en: String(formData.get('name_en') ?? '') }
  const approverRole = String(formData.get('approver_role') ?? '')
  if (!definitionKey) return { error: 'Missing workflow.' }
  if (!ROLES.includes(approverRole)) return { error: 'Pick an approver role.' }

  const { data: existing } = await supabase
    .from('workflow_stages')
    .select('seq')
    .eq('definition_key', definitionKey)
  const seq = nextSeq((existing ?? []).map((s) => s.seq))

  const { error } = await supabase
    .from('workflow_stages')
    .insert({ definition_key: definitionKey, seq, name, approver_role: approverRole })
  if (error) return { error: pgErrorMessage(error) }
  revalidatePath(P)
  return {}
}

export async function deleteStage(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getSuperAdminContext()
  const id = String(formData.get('id') ?? '')
  const { error } = await supabase.from('workflow_stages').delete().eq('id', id)
  if (error) return { error: pgErrorMessage(error) }
  revalidatePath(P)
  return {}
}
