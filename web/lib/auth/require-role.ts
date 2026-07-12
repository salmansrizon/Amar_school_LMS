import type { SupabaseClient } from '@supabase/supabase-js'

// Application-layer guard for server actions. RLS remains the authority;
// this gives a clean "Unauthorized" instead of leaking raw Postgres errors.
export async function requireSuperAdmin(supabase: SupabaseClient): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'super_admin'
}

/** True when the caller is a School Owner or Staff User (the /school group). */
export async function requireSchoolMember(supabase: SupabaseClient): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'school_owner' || profile?.role === 'staff_user'
}

/** True only for the School Owner — the institute profile (schools row) is
 *  owner-only even though the "institute" screen can be granted to Staff. */
export async function requireSchoolOwner(supabase: SupabaseClient): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'school_owner'
}

/** Same School Owner/Staff User check as requireSchoolMember, but also
 *  returns the caller's school_id — for actions (like SMS compose) that
 *  must stamp school_id explicitly rather than relying on a column default. */
export async function requireSchoolMemberProfile(
  supabase: SupabaseClient,
): Promise<{ ok: boolean; schoolId: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, schoolId: null }
  const { data: profile } = await supabase.from('profiles').select('role, school_id').eq('id', user.id).single()
  const ok = profile?.role === 'school_owner' || profile?.role === 'staff_user'
  return { ok, schoolId: ok ? (profile?.school_id ?? null) : null }
}
