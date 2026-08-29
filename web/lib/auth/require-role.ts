import type { SupabaseClient } from '@supabase/supabase-js'
import type { Role } from '@/lib/auth/routing'
import { authorize } from '@/lib/engines/policy/authorize'
import { PERMISSIONS } from '@/lib/engines/policy/catalog'

// Application-layer guard for server actions. RLS remains the authority; this
// gives a clean "Unauthorized" instead of leaking raw Postgres errors.
//
// The role-group guards (requireSuperAdmin, requireSchoolMember) now delegate to
// the Policy Engine (#262) — behaviour-identical, but authorization lives in one
// resolver over config tables instead of hardcoded role literals. The remaining
// guards additionally need the caller's school_id, so they still read the
// profile directly via `callerProfile`.

interface CallerProfile {
  role: Role | null
  schoolId: string | null
}

/** The signed-in caller's role + school_id, or nulls when unauthenticated. */
async function callerProfile(supabase: SupabaseClient): Promise<CallerProfile> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { role: null, schoolId: null }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, school_id')
    .eq('id', user.id)
    .single()
  return { role: (profile?.role as Role) ?? null, schoolId: profile?.school_id ?? null }
}

const isSchoolMember = (role: Role | null) => role === 'school_owner' || role === 'staff_user'

export async function requireSuperAdmin(supabase: SupabaseClient): Promise<boolean> {
  return (await authorize(supabase, PERMISSIONS.superAdminAccess)).allowed
}

/** True when the caller is a School Owner or Staff User (the /school group). */
export async function requireSchoolMember(supabase: SupabaseClient): Promise<boolean> {
  return (await authorize(supabase, PERMISSIONS.schoolAccess)).allowed
}

/** True only for the School Owner — the institute profile (schools row) is
 *  owner-only even though the "institute" screen can be granted to Staff. */
export async function requireSchoolOwner(supabase: SupabaseClient): Promise<boolean> {
  return (await authorize(supabase, PERMISSIONS.schoolOwner)).allowed
}

/** Same School Owner/Staff User check as requireSchoolMember, but also returns
 *  the caller's school_id — for actions (like SMS compose) that must stamp
 *  school_id explicitly rather than relying on a column default. */
export async function requireSchoolMemberProfile(
  supabase: SupabaseClient,
): Promise<{ ok: boolean; schoolId: string | null }> {
  const { role, schoolId } = await callerProfile(supabase)
  const ok = isSchoolMember(role)
  return { ok, schoolId: ok ? schoolId : null }
}

/** School Owner check that also returns their school_id — for owner-only actions
 *  that must resolve the caller's school (e.g. redeeming their own subscription,
 *  #169). */
export async function requireSchoolOwnerProfile(
  supabase: SupabaseClient,
): Promise<{ ok: boolean; schoolId: string | null }> {
  const { role, schoolId } = await callerProfile(supabase)
  const ok = role === 'school_owner'
  return { ok, schoolId: ok ? schoolId : null }
}
