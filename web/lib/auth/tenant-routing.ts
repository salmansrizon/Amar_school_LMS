// Pure decision layer for subdomain routing (issue #109, #107). Given the
// resolved host + the caller's session facts, decide whether to serve the
// request, bounce the user to their own subdomain, or show "no such school".
// Env-free and DB-free so it unit-tests as a matrix; proxy.ts gathers the facts
// and materializes the redirect URL.

import type { HostKind } from './tenant-host'
import { pathInGroup, type Role } from './routing'

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

/** The route groups that belong to a tenant and therefore live on that
 *  tenant's subdomain: staff at /school, Students at /student (#441). */
const TENANT_GROUPS = ['/school', '/student']

export function isTenantPath(path: string): boolean {
  return TENANT_GROUPS.some((g) => pathInGroup(path, g))
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

  // Apex: a signed-in tenant member hitting /school or /student belongs on
  // their own subdomain.
  if (isTenantPath(path) && session?.ownSubdomain) {
    return { type: 'redirect-subdomain', slug: session.ownSubdomain, path }
  }
  return { type: 'next' }
}
