import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

// Shared sign-in for the live-Supabase integration suites.
//
// Every suite used to sign each fixture user in from scratch — 83 calls to
// signInWithPassword across 35 files, against 4 distinct users. Supabase caps
// auth sign-ins per hour per project, so a full single-command run always
// starved somewhere: suites failed in beforeAll with "Request rate limit
// reached" while every one of them passed when run alone.
//
// The tokens are what the suites actually need, and a token outlives one file.
// So the first sign-in for a user is cached on disk and every later caller
// restores that session instead of asking the auth server for a new one. A run
// now spends one sign-in per user, not one per suite.
//
// The cache lives under node_modules/.cache (already git-ignored, already
// disposable); deleting it just means the next run signs in again.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/** The password every seeded fixture user shares (supabase/seed-test.sql). */
export const PASSWORD = 'test-password-123!'

const CACHE_FILE = path.join(process.cwd(), 'node_modules/.cache/asm-test-sessions.json')

/** Refresh rather than cut it fine — a suite that starts near expiry would
 *  otherwise fail mid-run instead of at login. */
const EXPIRY_MARGIN_SECONDS = 120

interface CachedSession {
  access_token: string
  refresh_token: string
  expires_at: number
}

function readCache(): Record<string, CachedSession> {
  try {
    return JSON.parse(readFileSync(CACHE_FILE, 'utf8')) as Record<string, CachedSession>
  } catch {
    // Absent or unreadable cache is normal — it just means "sign in".
    return {}
  }
}

function writeCache(cache: Record<string, CachedSession>): void {
  try {
    mkdirSync(path.dirname(CACHE_FILE), { recursive: true })
    writeFileSync(CACHE_FILE, JSON.stringify(cache), 'utf8')
  } catch {
    // A cache we cannot write is not a test failure; the run just costs the
    // sign-ins it would have saved.
  }
}

/** A signed-out client, for the anon-access checks some suites make. */
export function anonClient(): SupabaseClient {
  return createClient(URL, ANON, { auth: { persistSession: false } })
}

/**
 * A client authenticated as `email`. Reuses a cached session when one is still
 * valid, so a whole-suite run costs one sign-in per distinct user.
 *
 * Each caller gets its own client object — suites hold several side by side and
 * assert one cannot see another's rows — they merely share the token.
 */
export async function signedIn(email: string, password: string = PASSWORD): Promise<SupabaseClient> {
  const client = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const cache = readCache()
  const cached = cache[email]
  const nowSeconds = Math.floor(Date.now() / 1000)

  if (cached && cached.expires_at - EXPIRY_MARGIN_SECONDS > nowSeconds) {
    const { error } = await client.auth.setSession({
      access_token: cached.access_token,
      refresh_token: cached.refresh_token,
    })
    if (!error) return client
    // A rejected token (password changed, project reset) falls through to a
    // real sign-in rather than failing the suite.
  }

  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`login failed for ${email}: ${error.message}`)

  const session = data.session
  if (session?.access_token && session.refresh_token && session.expires_at) {
    cache[email] = {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
    }
    writeCache(cache)
  }
  return client
}
