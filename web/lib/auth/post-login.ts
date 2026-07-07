import type { SupabaseClient } from '@supabase/supabase-js'
import { homeFor, type Role } from '@/lib/auth/routing'

// After a session exists: ensure the profile exists (first login after email
// confirmation creates the School from signup metadata), return the role home.
export async function postLoginDestination(supabase: SupabaseClient): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return '/login'

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile) return homeFor(profile.role as Role)

  const schoolName = user.user_metadata?.school_name
  if (typeof schoolName === 'string' && schoolName.trim()) {
    const { error } = await supabase.rpc('register_school', { school_name: schoolName.trim() })
    if (!error) return homeFor('school_owner')
  }
  return '/login'
}
