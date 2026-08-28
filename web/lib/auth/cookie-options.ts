import { rootDomain } from './tenant-host'

// Auth cookie shape, shared by all three Supabase clients (browser, server,
// proxy). They must agree exactly: a cookie written by one and read by another
// under different options is a session that silently disappears.
//
// The session cookie has to span the apex and every tenant subdomain (#109's
// routing model), because logging in is a two-host operation: credentials are
// submitted wherever the user opened /login — often the apex — and the proxy
// then bounces school-scoped roles to `<slug>.<root>`. A host-only cookie does
// not travel on that bounce, so the subdomain saw an anonymous visitor and threw
// the user back to /login with an empty form: every Student and every School
// member who started at the apex had to log in twice.
//
// Nothing widens beyond the configured root domain: localhost (no dot),
// *.vercel.app previews and unknown hosts all get `undefined`, which leaves the
// browser's host-only default in place.

/** Cookie name for the session.
 *
 *  Deliberately NOT the `sb-<project-ref>-auth-token` default. Sessions issued
 *  before the domain widening are host-only cookies under that default name, and
 *  a host-only cookie and a domain cookie of the SAME name are two cookies the
 *  browser sends together — with the stale one able to shadow the fresh one on
 *  the very host the bounce lands on. Renaming makes the old ones unreadable
 *  instead of ambiguous: everyone signs in once more, deterministically, rather
 *  than some people looping until an invisible cookie expires. */
export const AUTH_COOKIE_NAME = 'edume-auth'

/** Cookie `domain` for auth cookies on this host, or undefined to leave it host-only. */
export function authCookieDomain(host: string | null | undefined): string | undefined {
  if (!host) return undefined
  const root = rootDomain().trim().toLowerCase().split(':')[0]
  if (!root.includes('.')) return undefined

  const h = host.trim().toLowerCase().split(':')[0]
  if (h !== root && !h.endsWith(`.${root}`)) return undefined

  return `.${root}`
}

/** Whether this host is local development, where `Secure` cookies cannot be set.
 *
 *  Keyed on the host being loopback rather than on `authCookieDomain` returning
 *  undefined: a `*.vercel.app` preview also has no root-domain match, but it is
 *  served over HTTPS and its session must still be `Secure`. */
function isLoopbackHost(host: string | null | undefined): boolean {
  if (!host) return false
  const raw = host.trim().toLowerCase()
  // An IPv6 literal in a Host header is bracketed — `[::1]:3000` — so splitting
  // on ':' the way the IPv4 path does truncates it to '[' and matches nothing.
  const close = raw.startsWith('[') ? raw.indexOf(']') : -1
  const h = close > 0 ? raw.slice(1, close) : raw.split(':')[0]
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.localhost')
}

/** The `cookieOptions` every Supabase client passes.
 *
 *  `@supabase/ssr`'s DEFAULT_COOKIE_OPTIONS sets `path`, `sameSite: 'lax'`,
 *  `httpOnly: false` and `maxAge`, and our object is spread over it — but it has
 *  no `secure` key at all, so without this the session cookie shipped without
 *  the attribute. That matters more here than in a single-host app: the cookie is
 *  deliberately widened to `.<root>` so it reaches every tenant subdomain (see
 *  `authCookieDomain`), and a domain-wide cookie with no `Secure` travels to any
 *  one of them that ever answers on plaintext HTTP.
 *
 *  `sameSite` is pinned rather than inherited so the value is visible at the one
 *  place the session's shape is decided, and a library default change cannot
 *  loosen it silently.
 *
 *  `httpOnly` is now safe to set, and is the point of #527: with the browser
 *  Supabase client deleted, no page JavaScript reads this cookie, so making it
 *  unreadable costs nothing and closes the #526 finding. */
export function authCookieOptions(host: string | null | undefined): {
  name: string
  domain?: string
  secure: boolean
  sameSite: 'lax'
  httpOnly: true
} {
  const domain = authCookieDomain(host)
  const base = {
    name: AUTH_COOKIE_NAME,
    secure: !isLoopbackHost(host),
    sameSite: 'lax' as const,
    // The whole point of #527. This was impossible while any browser Supabase
    // client existed — `createBrowserClient` reads the session from
    // `document.cookie`, so an HttpOnly cookie would simply be invisible to it and
    // the app would behave as though nobody were signed in.
    //
    // Setting it server-side only, with a browser client still present, is the
    // trap #526 named: RFC 6265bis 5.7 makes the browser discard that client's
    // refresh writes, so sign-in appears to work and the session then dies. It is
    // safe here precisely because `lib/supabase/client.ts` is gone — all fifteen
    // call sites are server actions now, and nothing in the page ever needs to
    // read the cookie.
    httpOnly: true as const,
  }
  return domain ? { ...base, domain } : base
}
