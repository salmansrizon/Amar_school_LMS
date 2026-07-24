import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { canAccess, homeFor, isProtectedPath, type Role } from '@/lib/auth/routing'
import { canOpenScreen, screenKeyForPath } from '@/lib/auth/screens'
import { resolveHost, rootDomain } from '@/lib/auth/tenant-host'
import { tenantRoute, type TenantSession } from '@/lib/auth/tenant-routing'

// Optimistic auth gate for the role route groups (ADR 0003) + subdomain→tenant
// routing (issue #109). Pages and RLS re-verify — this layer only routes:
// no session → /login; wrong role group → own home; wrong subdomain → own
// subdomain; unknown subdomain → branded "no such school".
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )

  // Always call getUser() so expired sessions refresh on any matched route.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const root = rootDomain()
  const host = resolveHost(request.headers.get('host'), root)

  // Resolve the request's subdomain to a school (tenant hosts only).
  let schoolForHostId: string | null = null
  if (host.kind === 'tenant') {
    // Security-definer RPC: schools RLS blocks anon SELECT, but an anonymous
    // visitor must still resolve a subdomain to reach its branded login.
    const { data } = await supabase.rpc('school_by_subdomain', { slug: host.slug })
    schoolForHostId = (data as { id: string }[] | null)?.[0]?.id ?? null
  }

  // The caller's own role + school + subdomain, for cross-subdomain bouncing.
  let session: TenantSession | null = null
  let profileRole: Role | null = null
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, school_id, schools(subdomain)')
      .eq('id', user.id)
      .single()
    if (profile) {
      profileRole = profile.role as Role
      const ownSubdomain =
        (profile.schools as { subdomain: string | null } | { subdomain: string | null }[] | null)
          ? extractSubdomain(profile.schools)
          : null
      session = { role: profileRole, schoolId: profile.school_id ?? null, ownSubdomain }
    }
  }

  // Subdomain routing decision (apex vs tenant, wrong-subdomain bounce, unknown).
  const decision = tenantRoute({ host, path, session, schoolForHostId })
  if (decision.type === 'no-such-school') {
    return NextResponse.rewrite(new URL('/no-such-school', request.url))
  }
  if (decision.type === 'redirect-subdomain') {
    const target = new URL(request.url)
    target.host = `${decision.slug}.${root}`
    target.pathname = decision.path
    return NextResponse.redirect(target)
  }

  // Below here: the existing role-group + staff-permission gate for protected paths.
  if (!isProtectedPath(path)) return response

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (!profileRole) {
    // Authenticated but not yet registered (e.g. mid-signup) — finish at login.
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const role = profileRole
  if (!canAccess(role, path)) {
    return NextResponse.redirect(new URL(homeFor(role), request.url))
  }

  // Staff Users: per-screen allow-list (issue #2) — server-enforced, not just nav.
  const screen = screenKeyForPath(path)
  if (role === 'staff_user' && screen) {
    const { data: grant } = await supabase
      .from('staff_permissions')
      .select('screen_key')
      .eq('staff_user_id', user.id)
      .eq('screen_key', screen)
      .maybeSingle()
    if (!canOpenScreen(role, grant ? [grant.screen_key] : [], screen)) {
      return NextResponse.redirect(new URL('/school/permission-denied', request.url))
    }
  }

  return response
}

/** Supabase returns an embedded to-one relation as an object, but the typings
 *  widen it to an array — normalize either shape to the subdomain string. */
function extractSubdomain(
  rel: { subdomain: string | null } | { subdomain: string | null }[] | null,
): string | null {
  if (!rel) return null
  const row = Array.isArray(rel) ? rel[0] : rel
  return row?.subdomain ?? null
}

export const config = {
  // Run on everything except Next internals + static assets, so subdomain
  // routing (branded login, no-such-school, cross-subdomain) applies site-wide.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)'],
}
