import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { homeFor, type Role } from '@/lib/auth/routing'
import type { SupabaseClient } from '@supabase/supabase-js'

// Per-request memoized auth + profile guard for the /super-admin/* group,
// mirroring lib/school/context.ts. Wrapped in React cache() so the layout and
// the page (and any nested server component) share ONE auth.getUser() +
// profiles lookup per request instead of each re-running it — the redundant
// second round-trip the raw preamble caused. RLS stays the authority; this is
// the clean application-layer gate.

export interface SuperAdminContext {
  supabase: SupabaseClient
  userId: string
  email: string
  fullName: string
}

export const getSuperAdminContext = cache(async (): Promise<SuperAdminContext> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()
  if (!profile) redirect('/login')
  // Wrong role group → their own home, not the login form (RoleShell convention).
  if (profile.role !== 'super_admin') redirect(homeFor(profile.role as Role))

  return {
    supabase,
    userId: user.id,
    email: user.email ?? '',
    fullName: profile.full_name ?? user.email ?? '',
  }
})
