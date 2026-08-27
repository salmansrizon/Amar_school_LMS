import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import { authCookieDomain } from '@/lib/auth/cookie-domain'

export async function createClient() {
  const cookieStore = await cookies()
  // Same root-domain scope the browser client uses, so a session refreshed on
  // the server does not silently narrow the cookie back to one host.
  const domain = authCookieDomain((await headers()).get('host'))
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...(domain ? { cookieOptions: { domain } } : {}),
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // Called from a Server Component — middleware refreshes sessions instead.
          }
        },
      },
    },
  )
}
