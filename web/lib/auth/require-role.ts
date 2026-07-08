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
