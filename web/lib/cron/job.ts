import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Shared scaffolding for Vercel-cron job routes (issue #163). Both the absence
// sweep and the expiry sweep authenticate the same way and talk to Supabase the
// same way; keep that in one place so a third cron doesn't re-copy it.

/** True when the request carries the correct `Bearer ${CRON_SECRET}` header.
 *  A missing CRON_SECRET fails closed. */
export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  return !!secret && request.headers.get('authorization') === `Bearer ${secret}`
}

/** Anon, session-less Supabase client for a cron job. Job RPCs are gated by the
 *  `vendor_secrets` reconcile secret ({@link reconcileSecret}), not by a user
 *  session — there is no service-role key in this environment. */
export function cronClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  )
}

/** The job secret every security-definer job RPC checks against vendor_secrets. */
export function reconcileSecret(): string {
  return process.env.RECONCILE_SECRET!
}

/** The target date a sweep runs for: `?date=YYYY-MM-DD` override, else today. */
export function cronTargetDate(request: Request): string {
  return new URL(request.url).searchParams.get('date') ?? new Date().toISOString().slice(0, 10)
}
