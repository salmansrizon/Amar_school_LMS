'use server'

import { revalidatePath } from 'next/cache'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { nextAgreementVersion, canDeleteVersion } from '@/lib/partner/agreements'

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
    if (error.code !== '23505') return { error: error.message } // not a version collision
  }
  return { error: 'Could not allocate a version — please retry.' }
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
  if (error) return { error: error.message }
  revalidatePath('/super-admin/agreements')
  return {}
}
