import type { NextRequest, NextResponse } from 'next/server'
import { authCookieDomain } from './cookie-options'

/** The cookie name `@supabase/ssr` would use if we had not renamed it.
 *
 *  Derived from the project URL the same way the library derives it, so it stays
 *  correct across local, preview, staging and production without a second env var
 *  to keep in step. */
function legacyStorageKey(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) return null
  const ref = new URL(url).hostname.split('.')[0]
  return ref ? `sb-${ref}-auth-token` : null
}

/** Expire the session cookie this app used before it was renamed to `edume-auth`.
 *
 *  The rename (see cookie-options.ts) means the old cookie is unreachable: it is
 *  not the name any client is configured for, so `signOut` cannot clear it and
 *  nothing else ever addresses it again. It simply sits in the browser until it
 *  expires — and `@supabase/ssr`'s default `maxAge` is 400 days — still carrying
 *  the access and refresh token material it held on the day of the rename.
 *
 *  #526 established that this app should not leave token material lying where it
 *  is not needed. Renaming the cookie and abandoning the old one with its contents
 *  intact would contradict the ticket that motivated the rename, so the old name
 *  is expired the first time we see it.
 *
 *  Only fires when the stale cookie is actually present, which makes it
 *  self-limiting: one `Max-Age=0` per browser, then the branch never matches
 *  again. That is deliberate — it needs no removal date and no reminder, and
 *  deleting this file early costs nothing but a few browsers keeping a dead cookie
 *  until it expires on its own.
 *
 *  Both scopes are cleared because the app has written both: host-only under the
 *  old default, and `.<root>` since the domain widening. A browser ignores a
 *  `Set-Cookie` for a scope it does not own, so naming the wrong one is inert
 *  rather than harmful — the failure mode of a mistake here is that nothing
 *  happens. */
export function expireLegacySessionCookie(request: NextRequest, response: NextResponse): void {
  const key = legacyStorageKey()
  if (!key) return

  // Supabase splits a large session across `<key>.0`, `<key>.1`, … so match the
  // prefix rather than the exact name, or the chunks outlive the cookie.
  const stale = request.cookies.getAll().filter((c) => c.name === key || c.name.startsWith(`${key}.`))
  if (!stale.length) return

  const domain = authCookieDomain(request.headers.get('host'))
  for (const { name } of stale) {
    // Appended as raw headers rather than through response.cookies, which is keyed
    // by NAME: setting the same cookie twice there overwrites instead of emitting
    // two Set-Cookie lines, so the host-only clear would be silently replaced by
    // the domain one. That is backwards for this migration — `main` has no domain
    // widening, so the stale cookie it wrote is precisely the host-only one.
    response.headers.append('set-cookie', `${name}=; Path=/; Max-Age=0; SameSite=Lax`)
    if (domain) {
      response.headers.append('set-cookie', `${name}=; Path=/; Max-Age=0; SameSite=Lax; Domain=${domain}`)
    }
  }
}
