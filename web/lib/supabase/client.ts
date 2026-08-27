import { createBrowserClient } from '@supabase/ssr'
import { authCookieDomain } from '@/lib/auth/cookie-domain'

export function createClient() {
  // Sign-in happens here, so this is where the session cookie is first written —
  // scope it to the root domain or the apex→subdomain bounce loses it.
  const domain = typeof window === 'undefined' ? undefined : authCookieDomain(window.location.host)
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    domain ? { cookieOptions: { domain } } : undefined,
  )
}
