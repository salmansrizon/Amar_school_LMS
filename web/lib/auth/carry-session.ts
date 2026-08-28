import type { NextResponse } from 'next/server'

/** Move a refreshed session from the response `proxy` built onto the one it returns instead.
 *
 *  `@supabase/ssr` refreshes an expiring session as a side effect of `getUser()`,
 *  writing `Set-Cookie` plus its own no-store headers onto whatever response
 *  existed at that moment. Every redirect and rewrite in `proxy` then builds a
 *  *new* response, so without this the refresh is discarded and the next request
 *  arrives with the same stale token — refreshing again, and dropping it again.
 *  The login bounce is exactly such a redirect (#545).
 *
 *  `headers` is the object the library handed `setAll`, replayed verbatim rather
 *  than matched against a list of our own: a second list would be a second place
 *  encoding which headers a refresh writes, and the day the library adds one more
 *  we would forward it in `setAll` and drop it here. */
export function carrySession(
  from: NextResponse,
  headers: Record<string, string>,
  to: NextResponse,
): NextResponse {
  from.cookies.getAll().forEach((cookie) => to.cookies.set(cookie))
  for (const [key, value] of Object.entries(headers)) to.headers.set(key, value)
  return to
}
