import type { SupabaseClient } from '@supabase/supabase-js'
import { homeFor, type Role } from '@/lib/auth/routing'

// After a session exists: route by role. Self-service school registration was
// removed (issue #111, decision #107) — provisioning is admin-only now, and an
// owner without a profile claims their pre-created school via a claim code
// (/claim) rather than registering from signup metadata.
export async function postLoginDestination(supabase: SupabaseClient): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return '/login'

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile) return homeFor(profile.role as Role)

  // Signed in but unbound → send them to redeem their owner-claim code.
  return '/claim'
}
