'use server'

import { revalidatePath } from 'next/cache'
import { requireSuperAdmin } from '@/lib/auth/require-role'
import { createClient } from '@/lib/supabase/server'
import { sanitizeEducationScope } from '@/lib/super-admin/gov'

// Government Official management (map #158, ticket #164). Accounts are minted
// through the shared create_vendor_user RPC (role gov_official); the designation
// + education-level scope live in gov_official_profiles.

/** Create a gov_official account (role fixed) via the vendor-user RPC. */
export async function createGovOfficial(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient()
  if (!(await requireSuperAdmin(supabase))) return { error: 'Unauthorized' }
  const { error } = await supabase.rpc('create_vendor_user', {
    user_email: String(formData.get('email')),
    user_password: String(formData.get('password')),
    user_full_name: String(formData.get('full_name')),
    user_role: 'gov_official',
  })
  if (error) return { error: error.message }
  revalidatePath('/super-admin/gov-officials')
  return {}
}

/** Set an official's designation + education-level scope. */
export async function updateGovProfile(
  profileId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  if (!(await requireSuperAdmin(supabase))) return { error: 'Unauthorized' }

  const designation = String(formData.get('designation') ?? '').trim() || null
  const scope = sanitizeEducationScope(formData.getAll('education_level_scope').map(String))

  const { error } = await supabase
    .from('gov_official_profiles')
    .upsert(
      { profile_id: profileId, designation, education_level_scope: scope, updated_at: new Date().toISOString() },
      { onConflict: 'profile_id' },
    )
  if (error) return { error: error.message }
  revalidatePath(`/super-admin/gov-officials/${profileId}`)
  return {}
}
