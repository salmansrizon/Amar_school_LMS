import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { homeFor, type Role } from '@/lib/auth/routing'
import type { SupabaseClient } from '@supabase/supabase-js'

// Per-request memoized auth + profile guard for a single-role app group. One
// factory the /distributor, /agent (and future single-role) groups share, so the
// gate logic lives in one place. RLS remains the authority; this is the clean
// application-layer redirect. cache() memoizes per role arg, so the layout and
// the wrapped page reuse one auth lookup per request.

export interface RoleContext {
  supabase: SupabaseClient
  userId: string
  fullName: string
}

export const getRoleContext = cache(async (role: Role): Promise<RoleContext> => {
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
  if (profile.role !== role) redirect(homeFor(profile.role as Role))

  return { supabase, userId: user.id, fullName: profile.full_name ?? user.email ?? '' }
})
