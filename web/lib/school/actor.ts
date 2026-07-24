import { createClient } from '@/lib/supabase/server'
import { requireSchoolOwner } from '@/lib/auth/require-role'
import type { SupabaseClient } from '@supabase/supabase-js'

// The server-action counterpart to getSchoolContext (lib/school/context.ts).
//
// Pages redirect on a bad session; actions instead surface an error string to
// the form, so they can't call getSchoolContext. Every action that writes
// tenant-scoped data first resolves the same fact — the caller's client, id and
// School — and that block was re-inlined (and, in two files, copied verbatim as
// a private `myProfile`) across the actions. It lives here once now.
//
// RLS remains the authority for what a caller may touch; this only resolves who
// they are and which School stamps their `{schoolId}/…` storage paths.

export interface Actor {
  supabase: SupabaseClient
  userId: string
  schoolId: string
}

export async function currentActor(): Promise<Actor | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const { data: profile } = await supabase.from('profiles').select('school_id').eq('id', user.id).single()
  if (!profile?.school_id) return { error: 'No school on profile' }
  return { supabase, userId: user.id, schoolId: profile.school_id }
}

/** Like currentActor, but also requires the caller be the School Owner — for
 *  the owner-only actions (institute profile, print theme, logo). RLS enforces
 *  it too; this is the belt-and-suspenders app-layer check. */
export async function currentOwner(): Promise<Actor | { error: string }> {
  const actor = await currentActor()
  if ('error' in actor) return actor
  if (!(await requireSchoolOwner(actor.supabase))) return { error: 'Unauthorized' }
  return actor
}
