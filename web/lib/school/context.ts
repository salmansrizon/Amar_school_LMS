import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Role } from '@/lib/auth/routing'
import type { SupabaseClient } from '@supabase/supabase-js'

// Per-request memoized auth + profile + grants + school for the /school/* group.
// Wrapped in React cache() so the layout AND the page (and any server component in
// the tree) resolve the SAME auth.getUser() + profiles + school queries once per
// request instead of each re-running the waterfall. This removes the duplicated
// getUser/profile round-trips that dominated deployed (serverless) latency.

export interface SchoolContext {
  supabase: SupabaseClient
  userId: string
  email: string
  role: Role
  fullName: string
  schoolId: string
  schoolName: string | null
  subscriptionExpiresAt: string | null
  grants: readonly string[]
}

export const getSchoolContext = cache(async (): Promise<SchoolContext> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, school_id')
    .eq('id', user.id)
    .single()
  if (!profile || (profile.role !== 'school_owner' && profile.role !== 'staff_user')) redirect('/login')
  const role = profile.role as Role

  // School + grants are independent → fetch in parallel, not in a waterfall.
  const [{ data: school }, grantsRes] = await Promise.all([
    supabase.from('schools').select('name, subscription_expires_at').eq('id', profile.school_id).maybeSingle(),
    role === 'staff_user'
      ? supabase.from('staff_permissions').select('screen_key').eq('staff_user_id', user.id)
      : Promise.resolve({ data: [] as { screen_key: string }[] }),
  ])

  return {
    supabase,
    userId: user.id,
    email: user.email ?? '',
    role,
    fullName: profile.full_name ?? user.email ?? '',
    schoolId: profile.school_id,
    schoolName: school?.name ?? null,
    subscriptionExpiresAt: school?.subscription_expires_at ?? null,
    grants: (grantsRes.data ?? []).map((p) => p.screen_key),
  }
})
