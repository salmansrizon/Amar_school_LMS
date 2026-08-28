'use server'

import { createClient } from '@/lib/supabase/server'
import { firstRelation } from '@/lib/supabase/relation'
import { homeFor, isSchoolScopedRole, type Role } from '@/lib/auth/routing'
import { postLoginDestination } from '@/lib/auth/post-login'

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

export type SignInResult = { destination: string } | { error: 'failed' | 'blocked' }

/** Sign in, apply the suspension rule, and say where to go next.
 *
 *  All of this used to run in the page against a browser Supabase client, which
 *  needs the session cookie readable by page JavaScript — the #526 finding #527
 *  removes. A Server Action can write cookies, so the session is established here
 *  and the browser never handles it.
 *
 *  The suspension check stays exactly where it was in the sequence: after a valid
 *  password, before the caller is let in. A deactivated school (#161) denies its
 *  owner and staff, and the session is dropped again so none lingers — which
 *  matters more now, not less, because the browser can no longer sign itself out
 *  of a session it cannot see.
 *
 *  Errors are returned as codes rather than messages: the page owns the wording in
 *  two languages, and an auth failure must not leak whether it was the address or
 *  the password that was wrong. */
export async function signInAction(email: string, password: string): Promise<SignInResult> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.user) return { error: 'failed' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, schools(deactivated_at)')
    .eq('id', data.user.id)
    .single()

  const school = firstRelation(profile?.schools)
  if (isSchoolScopedRole(profile?.role) && (school?.deactivated_at ?? null) !== null) {
    await supabase.auth.signOut()
    return { error: 'blocked' }
  }

  return { destination: await postLoginDestination(supabase) }
}

/** Send a password-reset email.
 *
 *  Always reports success. Telling a caller whether an address exists is an
 *  account-enumeration oracle, and this endpoint is unauthenticated — the browser
 *  version returned void for the same reason, so nothing is lost by moving it. */
export async function requestPasswordReset(email: string, redirectTo: string): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.resetPasswordForEmail(email, { redirectTo })
}

/** Set a new password for the caller of the recovery link.
 *
 *  Authorised by the recovery session the /auth/callback route already
 *  established, which is why this needs no old password: the caller proved
 *  possession of the mailbox. Runs server-side so the session it consumes never
 *  has to be readable by the page. */
export async function updatePassword(
  password: string,
): Promise<{ destination?: string; error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { error: error.message }
  // Returned from here so the page needs no Supabase client of its own just to
  // ask where the caller belongs.
  return { destination: await postLoginDestination(supabase) }
}

/** Create an account for someone holding a school claim code.
 *
 *  Provisioning is admin-only (#111/#107), so this is not open registration: the
 *  account is worthless without a claim code, and redeeming one is what binds it
 *  to a school. */
export async function signUpForClaim(
  email: string,
  password: string,
  emailRedirectTo: string,
): Promise<{ hasSession?: boolean; error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo } })
  if (error) return { error: error.message }
  return { hasSession: data.session !== null }
}

/** Where a signed-in caller belongs, or null when they are not signed in.
 *
 *  The claim screen asks this on mount to decide which of its three phases to
 *  show. It used to read the session from the browser client. */
export async function claimEntryPhase(): Promise<{ signedIn: boolean; destination: string | null }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { signedIn: false, destination: null }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return { signedIn: true, destination: profile ? homeFor(profile.role as Role) : null }
}

/** Redeem a school claim code, binding the signed-in account to its school. */
export async function redeemClaimCode(code: string, subdomain: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('redeem_school_claim_code', {
    code_text: code,
    desired_subdomain: subdomain,
  })
  return error ? { error: error.message } : {}
}
