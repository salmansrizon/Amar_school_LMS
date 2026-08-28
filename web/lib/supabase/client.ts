import { createBrowserClient } from '@supabase/ssr'
import { authCookieOptions } from '@/lib/auth/cookie-options'

export function createClient() {
  // Sign-in happens here, so this is where the session cookie is first written —
  // scope it to the root domain or the apex→subdomain bounce loses it.
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: authCookieOptions(typeof window === 'undefined' ? null : window.location.host) },
  )
}
