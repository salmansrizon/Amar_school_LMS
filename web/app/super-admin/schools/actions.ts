'use server'

import { revalidatePath } from 'next/cache'
import { requireSuperAdmin } from '@/lib/auth/require-role'
import { createClient } from '@/lib/supabase/server'
import { rootDomain } from '@/lib/auth/tenant-host'
import { normalizeSlug, validateSlug } from '@/lib/subdomain'
import { isFeatureFlag } from '@/lib/super-admin/feature-flags'

// Super-admin B2B panel actions (issue #111). RLS is the authority; these give
// clean errors + revalidate the list.

/** Create a school (name + header info) and mint its first owner-claim code. */
export async function createSchool(formData: FormData): Promise<{ error?: string; code?: string }> {
  const supabase = await createClient()
  if (!(await requireSuperAdmin(supabase))) return { error: 'Unauthorized' }

  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'name required' }

  const { data: school, error } = await supabase
    .from('schools')
    .insert({
      name,
      address_line: strOrNull(formData.get('address_line')),
      mobile: strOrNull(formData.get('mobile')),
      email: strOrNull(formData.get('email')),
      eiin_no: strOrNull(formData.get('eiin_no')),
    })
    .select('id')
    .single()
  if (error) return { error: error.message }

  const { data: code, error: codeError } = await supabase.rpc('generate_school_claim_code', {
    sid: school.id,
  })
  if (codeError) return { error: codeError.message }

  revalidatePath('/super-admin/schools')
  return { code: (code as { code: string }).code }
}

/** Edit a school's header info (address/mobile/email/EIIN). */
export async function updateSchoolHeader(
  schoolId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  if (!(await requireSuperAdmin(supabase))) return { error: 'Unauthorized' }

  const { error } = await supabase
    .from('schools')
    .update({
      address_line: strOrNull(formData.get('address_line')),
      mobile: strOrNull(formData.get('mobile')),
      email: strOrNull(formData.get('email')),
      eiin_no: strOrNull(formData.get('eiin_no')),
    })
    .eq('id', schoolId)
  if (error) return { error: error.message }
  revalidatePath('/super-admin/schools')
  return {}
}

/** Rename (or first-set) a school's subdomain — validated + globally unique. */
export async function renameSubdomain(
  schoolId: string,
  subdomain: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  if (!(await requireSuperAdmin(supabase))) return { error: 'Unauthorized' }

  const slug = normalizeSlug(subdomain)
  if (validateSlug(slug) !== null) return { error: 'invalid subdomain' }

  const { error } = await supabase.from('schools').update({ subdomain: slug }).eq('id', schoolId)
  if (error) {
    // 23505 = unique_violation → the slug is taken.
    if (error.code === '23505') return { error: 'subdomain already taken' }
    return { error: error.message }
  }
  revalidatePath('/super-admin/schools')
  return {}
}

/** Mint another owner-claim code for a school. */
export async function generateClaimCode(schoolId: string): Promise<{ error?: string; code?: string }> {
  const supabase = await createClient()
  if (!(await requireSuperAdmin(supabase))) return { error: 'Unauthorized' }
  const { data, error } = await supabase.rpc('generate_school_claim_code', { sid: schoolId })
  if (error) return { error: error.message }
  revalidatePath('/super-admin/schools')
  return { code: (data as { code: string }).code }
}

/** Grant a time-boxed trial (default 15 days). Consumes no subscription code. */
export async function startTrial(schoolId: string, days: number): Promise<{ error?: string }> {
  const supabase = await createClient()
  if (!(await requireSuperAdmin(supabase))) return { error: 'Unauthorized' }
  const { error } = await supabase.rpc('start_trial', { sid: schoolId, days })
  if (error) return { error: error.message }
  revalidatePath('/super-admin/schools')
  return {}
}

/** Kick off Supabase's self-service password recovery for the school's owner,
 *  landing them back on their own subdomain. Anon-key method — no service-role,
 *  the super-admin never sees or sets the password. */
export async function sendOwnerReset(schoolId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  if (!(await requireSuperAdmin(supabase))) return { error: 'Unauthorized' }

  const { data: email, error: emailError } = await supabase.rpc('school_owner_email', { sid: schoolId })
  if (emailError) return { error: emailError.message }
  if (!email) return { error: 'no owner bound yet' }

  const { data: school } = await supabase.from('schools').select('subdomain').eq('id', schoolId).single()
  const base = school?.subdomain
    ? `https://${school.subdomain}.${rootDomain()}`
    : `https://${rootDomain()}`
  const { error } = await supabase.auth.resetPasswordForEmail(email as string, {
    redirectTo: `${base}/auth/callback?next=/reset-password/update`,
  })
  if (error) return { error: error.message }
  return {}
}

/** Set/extend the school's subscription expiry directly (issue #162 — the
 *  single-expiry model). Complements startTrial / redeemCode / decreaseExpiry:
 *  the admin can extend a lapsed window or correct an active one without a code.
 *  `date` is a plain YYYY-MM-DD; status is recomputed on read. */
export async function setSubscriptionExpiry(schoolId: string, date: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  if (!(await requireSuperAdmin(supabase))) return { error: 'Unauthorized' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'invalid date' }
  const { error } = await supabase
    .from('schools')
    .update({ subscription_expires_at: date })
    .eq('id', schoolId)
  if (error) return { error: error.message }
  revalidatePath(`/super-admin/schools/${schoolId}`)
  revalidatePath('/super-admin/schools')
  return {}
}

/** Block/unblock a school (issue #161). Blocking stamps `deactivated_at`, which
 *  the login gate (proxy + login form) denies on — a hard switch, separate from
 *  subscription expiry. Unblocking clears it. */
export async function setSchoolBlocked(schoolId: string, blocked: boolean): Promise<{ error?: string }> {
  const supabase = await createClient()
  if (!(await requireSuperAdmin(supabase))) return { error: 'Unauthorized' }
  const { error } = await supabase
    .from('schools')
    .update({ deactivated_at: blocked ? new Date().toISOString() : null })
    .eq('id', schoolId)
  if (error) return { error: error.message }
  revalidatePath(`/super-admin/schools/${schoolId}`)
  revalidatePath('/super-admin/schools')
  return {}
}

/** Permanently delete a school (issue #161). Child tables cascade (FKs are
 *  ON DELETE CASCADE). `.select()` so an RLS-blocked delete surfaces as a
 *  visible failure rather than a silent 204. */
export async function deleteSchool(schoolId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  if (!(await requireSuperAdmin(supabase))) return { error: 'Unauthorized' }
  const { data, error } = await supabase.from('schools').delete().eq('id', schoolId).select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'school not deleted' }
  revalidatePath('/super-admin/schools')
  return {}
}

/** Toggle a per-school feature flag (issue #168). Storage only — nothing
 *  enforces the flag yet. Unknown keys are rejected so the table stays to the
 *  curated flag set. */
export async function setFeatureFlag(
  schoolId: string,
  flagKey: string,
  enabled: boolean,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  if (!(await requireSuperAdmin(supabase))) return { error: 'Unauthorized' }
  if (!isFeatureFlag(flagKey)) return { error: 'unknown flag' }
  const { error } = await supabase
    .from('school_feature_flags')
    .upsert(
      { school_id: schoolId, flag_key: flagKey, enabled, updated_at: new Date().toISOString() },
      { onConflict: 'school_id,flag_key' },
    )
  if (error) return { error: error.message }
  revalidatePath(`/super-admin/schools/${schoolId}`)
  return {}
}

/** Top up a school's SMS credits (map #171 T7): a credit row records both the
 *  credits granted (`delta`) and the ৳ the admin collected (`amount`, the SMS
 *  income stream). Super-admin only — RLS also gates the insert. */
export async function topUpSmsCredits(
  schoolId: string,
  credits: number,
  amount: number,
  note: string | null,
): Promise<{ error?: string; poolLow?: boolean }> {
  const supabase = await createClient()
  if (!(await requireSuperAdmin(supabase))) return { error: 'Unauthorized' }
  if (!Number.isInteger(credits) || credits <= 0) return { error: 'credits must be a positive whole number' }
  if (!Number.isFinite(amount) || amount < 0) return { error: 'invalid amount' }

  // Allocation writes the per-school credit AND the master-pool draw-down (#188)
  // in one atomic RPC, so the two ledgers can't drift. Returns the new pool
  // balance; a negative result means the pool couldn't cover it — warn (never
  // block) so the admin re-buys from the gateway rather than getting stuck.
  const { data: poolBalance, error } = await supabase.rpc('sms_allocate_to_school', {
    p_school: schoolId,
    p_credits: credits,
    p_amount: amount,
    p_note: note,
  })
  if (error) return { error: 'top-up failed' }

  revalidatePath(`/super-admin/schools/${schoolId}`)
  revalidatePath('/super-admin') // the landing SMS-income + pool cards
  return { poolLow: (poolBalance as number | null ?? 0) < 0 }
}

function strOrNull(value: FormDataEntryValue | null): string | null {
  const s = String(value ?? '').trim()
  return s === '' ? null : s
}
