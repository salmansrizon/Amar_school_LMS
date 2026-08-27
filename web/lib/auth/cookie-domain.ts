import { rootDomain } from './tenant-host'

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

/** Cookie `domain` for auth cookies on this host, or undefined to leave it host-only. */
export function authCookieDomain(host: string | null | undefined): string | undefined {
  if (!host) return undefined
  const root = rootDomain().trim().toLowerCase().split(':')[0]
  if (!root.includes('.')) return undefined

  const h = host.trim().toLowerCase().split(':')[0]
  if (h !== root && !h.endsWith(`.${root}`)) return undefined

  return `.${root}`
}
