'use server'

import { createClient } from '@/lib/supabase/server'

/** End the session, server-side.
 *
 *  The logout button called `auth.signOut()` on a browser client, which needs the
 *  session cookie to be readable by page JavaScript — the #526 finding #527
 *  removes. Signing out from a server action clears the same cookies through the
 *  server client's cookie store, and a Server Action is allowed to write cookies
 *  where a Server Component is not.
 *
 *  It also makes sign-out work in the one case the browser version could not: when
 *  the cookie becomes HttpOnly, `signOut()` in the page has nothing to clear. */
export async function signOutAction(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
}
