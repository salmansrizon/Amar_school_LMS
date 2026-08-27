import type { SupabaseClient } from '@supabase/supabase-js'
import { PASSWORD } from './auth'

// Staff-login fixtures, provisioned through the same RPC the product uses.
//
// ADR 0018's rule is about which Staff User is looking, so testing it needs more
// than the two logins seed-test.sql ships: a Subject Teacher WITH a login (the
// seed's `Seed Subject Teacher` employee has none, deliberately — it was created
// to test the no-login case), and an office-staff login attached to no class at
// all. Both are created here rather than in the seed because the seed writes to
// `auth.users`, which needs a service-role key this project does not have (map
// #434) — `create_staff_user` is the self-gating definer RPC that exists for
// exactly that reason, and a School Owner may call it.
//
// Idempotent: a second run finds the login already there and reuses it, so the
// suite costs one sign-in per user per session cache rather than one per run.

export interface StaffFixture {
  email: string
  fullName: string
  /** Screen grants to hold. ADR 0018 makes attachment the axis that matters
   *  here, but a grant is still what opens the screen. */
  screens?: string[]
}

/** Create the login if it does not exist, and return its profile id either way. */
export async function ensureStaffLogin(
  owner: SupabaseClient,
  { email, fullName, screens = [] }: StaffFixture,
): Promise<string> {
  const created = await owner.rpc('create_staff_user', {
    staff_email: email,
    staff_password: PASSWORD,
    staff_full_name: fullName,
  })

  let profileId: string | null = (created.data as string | null) ?? null

  if (created.error) {
    // The only error we tolerate is the one that means "already provisioned".
    if (!/already in use/i.test(created.error.message)) throw new Error(created.error.message)
    const { data, error } = await owner
      .from('profiles')
      .select('id')
      .eq('full_name', fullName)
      .eq('role', 'staff_user')
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new Error(`${email} exists but no profile named "${fullName}" is readable`)
    profileId = data.id
  }

  if (!profileId) throw new Error(`could not resolve a profile for ${email}`)

  if (screens.length) {
    const { error } = await owner
      .from('staff_permissions')
      .upsert(
        screens.map((screen_key) => ({ staff_user_id: profileId, screen_key })),
        { onConflict: 'staff_user_id,screen_key', ignoreDuplicates: true },
      )
    if (error) throw new Error(error.message)
  }

  return profileId
}

/** Point an existing `employees` row at a login, so a class attachment resolves. */
export async function linkEmployeeToLogin(
  owner: SupabaseClient,
  employeeId: string,
  profileId: string,
): Promise<void> {
  const { error } = await owner
    .from('employees')
    .update({ profile_id: profileId })
    .eq('id', employeeId)
  if (error) throw new Error(error.message)
}
