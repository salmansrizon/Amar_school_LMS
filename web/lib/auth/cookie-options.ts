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

/** The `cookieOptions` every Supabase client passes. */
export function authCookieOptions(host: string | null | undefined): {
  name: string
  domain?: string
} {
  const domain = authCookieDomain(host)
  return domain ? { name: AUTH_COOKIE_NAME, domain } : { name: AUTH_COOKIE_NAME }
}
