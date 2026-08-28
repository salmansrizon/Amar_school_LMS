import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import { authCookieOptions } from '@/lib/auth/cookie-options'

export async function createClient() {
  const cookieStore = await cookies()
  // Same name and root-domain scope the browser client uses, so a session
  // refreshed on the server does not silently narrow the cookie back to one host.
  const cookieOptions = authCookieOptions((await headers()).get('host'))
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions,
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
