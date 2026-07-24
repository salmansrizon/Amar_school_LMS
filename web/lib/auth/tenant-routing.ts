// Pure decision layer for subdomain routing (issue #109, #107). Given the
// resolved host + the caller's session facts, decide whether to serve the
// request, bounce the user to their own subdomain, or show "no such school".
// Env-free and DB-free so it unit-tests as a matrix; proxy.ts gathers the facts
// and materializes the redirect URL.

import type { HostKind } from './tenant-host'
import type { Role } from './routing'

export interface TenantSession {
  role: Role
  schoolId: string | null
  /** The caller's own school subdomain, if one is set. */
  ownSubdomain: string | null
}

export interface TenantFacts {
  host: HostKind
  path: string
  session: TenantSession | null
  /** School id the request's subdomain resolves to; null if no such school. */
  schoolForHostId: string | null
}

export type TenantAction =
  | { type: 'next' }
  | { type: 'no-such-school' }
  /** Bounce to the same path on the user's own subdomain. */
  | { type: 'redirect-subdomain'; slug: string; path: string }

function isSchoolPath(path: string): boolean {
  return path === '/school' || path.startsWith('/school/')
}

export function tenantRoute(facts: TenantFacts): TenantAction {
  const { host, path, session, schoolForHostId } = facts

  if (host.kind === 'tenant') {
    // Unknown subdomain → branded "no such school", never the app.
    if (schoolForHostId === null) return { type: 'no-such-school' }

    // A signed-in member of a different tenant landed on the wrong subdomain →
    // send them to their own. (Vendor roles have no school_id — leave them.)
    if (
      session &&
      session.schoolId &&
      session.schoolId !== schoolForHostId &&
      session.ownSubdomain
    ) {
      return { type: 'redirect-subdomain', slug: session.ownSubdomain, path }
    }
    return { type: 'next' }
  }

  // Apex: a signed-in tenant member hitting /school belongs on their subdomain.
  if (isSchoolPath(path) && session?.ownSubdomain) {
    return { type: 'redirect-subdomain', slug: session.ownSubdomain, path }
  }
  return { type: 'next' }
}
