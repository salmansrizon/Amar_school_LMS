'use server'

import { revalidatePath } from 'next/cache'
import { getSuperAdminContext } from '@/lib/super-admin/context'

export async function updateLegalProfile(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getSuperAdminContext()
  const status = String(formData.get('status') ?? 'pending')
  const legalEntityName = String(formData.get('legal_entity_name') ?? '').trim() || null
  const tin = String(formData.get('tin') ?? '').trim() || null
  const bin = String(formData.get('bin') ?? '').trim() || null
  const address = String(formData.get('registered_address') ?? '').trim() || null
  const evidence = String(formData.get('adviser_evidence') ?? '').trim() || null
  if (!['pending', 'ready'].includes(status)) return { error: 'Legal approval requires external review.' }
  if (status === 'ready' && (!legalEntityName || !address || !evidence)) {
    return { error: 'Ready status requires entity, address, and adviser evidence.' }
  }

  const { error } = await supabase.from('vendor_legal_profile').upsert({
    singleton: true,
    legal_entity_name: legalEntityName,
    tin,
    bin,
    registered_address: address,
    adviser_evidence: evidence,
    status,
    updated_at: new Date().toISOString(),
  })
  if (error) return { error: error.message }
  revalidatePath('/super-admin/readiness')
  return {}
}

export async function createTenderProfile(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getSuperAdminContext()
  const entity = String(formData.get('procuring_entity') ?? '').trim()
  const reference = String(formData.get('tender_reference') ?? '').trim()
  if (!entity || !reference) return { error: 'Procuring entity and tender reference are required.' }
  const { error } = await supabase.rpc('government_tender_profile_create', {
    p_procuring_entity: entity,
    p_tender_reference: reference,
    p_document_version: String(formData.get('document_version') ?? '').trim() || null,
    p_document_date: String(formData.get('document_date') ?? '').trim() || null,
    p_submission_deadline: String(formData.get('submission_deadline') ?? '').trim() || null,
  })
  if (error) return { error: error.message }
  revalidatePath('/super-admin/readiness')
  return {}
}

export async function updateTenderEvidence(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getSuperAdminContext()
  const id = String(formData.get('id') ?? '')
  const status = String(formData.get('status') ?? 'blocked')
  if (!id || !['blocked', 'baseline', 'ready'].includes(status)) return { error: 'Approval requires external review.' }
  const { error } = await supabase.from('government_tender_evidence').update({
    buyer_requirement: String(formData.get('buyer_requirement') ?? '').trim() || null,
    amar_evidence: String(formData.get('amar_evidence') ?? '').trim() || null,
    accountable_owner: String(formData.get('accountable_owner') ?? '').trim() || null,
    status,
  }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/super-admin/readiness')
  return {}
}

export async function updateTaxTreatment(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getSuperAdminContext()
  const id = String(formData.get('id') ?? '')
  const rate = Number(formData.get('rate_bp') ?? 0)
  const inclusive = String(formData.get('inclusive') ?? '') === 'true'
  const source = String(formData.get('source_reference') ?? '').trim() || null
  if (!id || !Number.isInteger(rate) || rate < 0) return { error: 'Rate must be a non-negative whole number.' }
  const current = await supabase.from('tax_treatment_config').select('status').eq('id', id).single()
  if (current.error || current.data?.status !== 'pending') return { error: 'Only pending treatments can be edited here.' }
  const { error } = await supabase.from('tax_treatment_config').update({
    rate_bp: rate, inclusive, source_reference: source, status: 'pending',
  }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/super-admin/readiness')
  return {}
}
