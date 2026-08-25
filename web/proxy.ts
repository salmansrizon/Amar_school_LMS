import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { canAccess, homeFor, isProtectedPath, isSchoolMemberRole, type Role } from '@/lib/auth/routing'
import { canOpenScreen, screenKeyForPath } from '@/lib/auth/screens'
import { resolveHost, rootDomain } from '@/lib/auth/tenant-host'
import { isTenantPath, tenantRoute, type TenantSession } from '@/lib/auth/tenant-routing'
import { firstRelation } from '@/lib/supabase/relation'

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

  // The caller's own role + school + subdomain, for cross-subdomain bouncing and
  // role gating. Skip the lookup on public apex paths (marketing/login) that
  // need neither — only tenant hosts, /school, and protected groups do.
  let session: TenantSession | null = null
  let profileRole: Role | null = null
  let schoolDeactivated = false
  const needsProfile =
    !!user && (host.kind === 'tenant' || isTenantPath(path) || isProtectedPath(path))
  if (needsProfile) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, school_id, schools(subdomain, deactivated_at)')
      .eq('id', user!.id)
      .single()
    if (profile) {
      profileRole = profile.role as Role
      schoolDeactivated = extractDeactivated(profile.schools)
      session = {
        role: profileRole,
        schoolId: profile.school_id ?? null,
        ownSubdomain: extractSubdomain(profile.schools),
      }
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

  // Hard block: a deactivated school (schools.deactivated_at, issue #161) denies
  // its owner/staff /school access and its Students /student access (#441).
  // Separate from subscription expiry (#169)
  // — this is a manual super-admin switch, so the message is a suspension, not a
  // renewal prompt. Pages re-verify; this is the optimistic gate.
  if (isSchoolMemberRole(role) && schoolDeactivated) {
    return NextResponse.rewrite(new URL('/account-blocked', request.url))
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
  return firstRelation(rel)?.subdomain ?? null
}

/** True when the caller's school carries the block flag (issue #161). */
function extractDeactivated(
  rel: { deactivated_at: string | null } | { deactivated_at: string | null }[] | null,
): boolean {
  return (firstRelation(rel)?.deactivated_at ?? null) !== null
}

export const config = {
  // Run on everything except Next internals + static assets, so subdomain
  // routing (branded login, no-such-school, cross-subdomain) applies site-wide.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)'],
}
