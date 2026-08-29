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
