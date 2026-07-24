'use server'

import { revalidatePath } from 'next/cache'
import { requireSuperAdmin } from '@/lib/auth/require-role'
import { createClient } from '@/lib/supabase/server'
import { rootDomain } from '@/lib/auth/tenant-host'
import { normalizeSlug, validateSlug } from '@/lib/subdomain'

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

function strOrNull(value: FormDataEntryValue | null): string | null {
  const s = String(value ?? '').trim()
  return s === '' ? null : s
}
