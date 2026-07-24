// Host → tenant resolution for the subdomain routing model (issue #109, #107).
// The apex serves marketing + claim-signup + non-tenant roles; a single-label
// subdomain of NEXT_PUBLIC_ROOT_DOMAIN is a tenant slug. `www` and Vercel
// preview hosts (`*.vercel.app`) are treated as apex.

export type HostKind =
  | { kind: 'apex' }
  | { kind: 'tenant'; slug: string }

/** Strip a `:port` suffix and lowercase — Host headers vary in both. */
function bareHost(host: string): string {
  return host.trim().toLowerCase().split(':')[0]
}

/**
 * Resolve a request Host into apex vs a tenant slug, relative to the configured
 * root domain (`localhost` in dev, e.g. `eduwave.com` in prod). The slug is not
 * validated or checked against the DB here — that is the caller's job.
 */
export function resolveHost(host: string | null | undefined, rootDomain: string): HostKind {
  if (!host) return { kind: 'apex' }
  const h = bareHost(host)
  const root = bareHost(rootDomain)

  // Vercel preview deployments always live under the shared apex.
  if (h === 'vercel.app' || h.endsWith('.vercel.app')) return { kind: 'apex' }

  if (h === root || h === `www.${root}`) return { kind: 'apex' }

  if (h.endsWith(`.${root}`)) {
    const prefix = h.slice(0, -(root.length + 1))
    // Only a single label is a tenant; `www` and deeper nesting fall back to apex.
    if (prefix === 'www' || prefix.includes('.')) return { kind: 'apex' }
    return { kind: 'tenant', slug: prefix }
  }

  // A host outside the root domain (bare IP, unknown domain) → apex.
  return { kind: 'apex' }
}

/** The root domain from env, defaulting to localhost for local dev. */
export function rootDomain(): string {
  return process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000'
}
