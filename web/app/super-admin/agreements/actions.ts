'use server'

import { revalidatePath } from 'next/cache'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { nextAgreementVersion, canDeleteVersion } from '@/lib/partner/agreements'
import { pgErrorMessage } from '@/lib/crud/pg-error'

// Super-admin agreement-version CRUD (#288) — the write-pattern reference for the
// bulk config-CRUD tickets: thin server action → pure helper → RLS-guarded write.
// RLS ("super admin manages agreement_versions") is the real authority; the
// getSuperAdminContext guard redirects non-super callers before we get here.

export async function createAgreementVersion(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getSuperAdminContext()
  const body = String(formData.get('body') ?? '').trim()
  const effectiveFrom = String(formData.get('effective_from') ?? '').trim()
  if (!body) return { error: 'Agreement text is required.' }

  // version is the PK, so integrity is guaranteed; the only race is two admins
  // computing the same next number. Retry on the unique-violation to recompute
  // rather than surface a collision error.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: existing } = await supabase.from('agreement_versions').select('version')
    const version = nextAgreementVersion((existing ?? []).map((v) => v.version))
    const { error } = await supabase.from('agreement_versions').insert({
      version,
      body,
      ...(effectiveFrom ? { effective_from: effectiveFrom } : {}),
    })
    if (!error) {
      revalidatePath('/super-admin/agreements')
      return {}
    }
    if (error.code !== '23505') return { error: pgErrorMessage(error) } // not a version collision
  }
  return { error: 'Could not allocate a version — please retry.' }
}

export async function updateAgreementVersion(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getSuperAdminContext()
  const version = Number(formData.get('version'))
  const body = String(formData.get('body') ?? '').trim()
  const effectiveFrom = String(formData.get('effective_from') ?? '').trim()
  if (!Number.isInteger(version)) return { error: 'Invalid version.' }
  if (!body) return { error: 'Agreement text is required.' }
  if (!effectiveFrom) return { error: 'Effective-from date is required.' }

  // Same rule as delete: a version any distributor has accepted is a legal
  // record of what they agreed to — editing it after the fact would silently
  // rewrite that record, so it's locked exactly like deletion is.
  const { data: accepted } = await supabase.from('distributor_agreement_acceptances').select('agreement_version')
  if (!canDeleteVersion(version, (accepted ?? []).map((a) => a.agreement_version))) {
    return { error: 'Cannot edit — this version has been accepted (legal record).' }
  }

  const { error } = await supabase
    .from('agreement_versions')
    .update({ body, effective_from: effectiveFrom })
    .eq('version', version)
  if (error) return { error: pgErrorMessage(error) }
  revalidatePath('/super-admin/agreements')
  return {}
}

// Records a distributor's acceptance on their behalf (offline/paper-signed
// agreements) — the accept_agreement RPC (migration 0101) already authorizes
// this for a super_admin caller (is_super_or_system), same RPC the
// distributor's own self-service onboarding flow calls for themselves
// (app/distributor/onboarding/actions.ts). No ip/user-agent to capture here
// since it's the admin's session, not the distributor's — the device field
// says so plainly rather than leaving it blank and looking like a gap.
export async function recordDistributorAcceptance(formData: FormData): Promise<{ error?: string }> {
  const { supabase, fullName } = await getSuperAdminContext()
  const distributorId = String(formData.get('distributor_id') ?? '').trim()
  const version = Number(formData.get('version'))
  if (!distributorId) return { error: 'Pick a distributor.' }
  if (!Number.isInteger(version)) return { error: 'Invalid version.' }

  const { error } = await supabase.rpc('accept_agreement', {
    p_version: version,
    p_distributor: distributorId,
    p_device: `recorded by super admin (${fullName})`,
  })
  if (error) return { error: pgErrorMessage(error) }
  revalidatePath('/super-admin/agreements')
  return {}
}

export async function deleteAgreementVersion(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getSuperAdminContext()
  const version = Number(formData.get('version'))
  if (!Number.isInteger(version)) return { error: 'Invalid version.' }

  const { data: accepted } = await supabase.from('distributor_agreement_acceptances').select('agreement_version')
  if (!canDeleteVersion(version, (accepted ?? []).map((a) => a.agreement_version))) {
    return { error: 'Cannot delete — this version has been accepted (legal record).' }
  }

  const { error } = await supabase.from('agreement_versions').delete().eq('version', version)
  if (error) return { error: pgErrorMessage(error) }
  revalidatePath('/super-admin/agreements')
  return {}
}
