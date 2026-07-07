import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { canAccess, homeFor, isProtectedPath, type Role } from '@/lib/auth/routing'
import { canOpenScreen, screenKeyForPath } from '@/lib/auth/screens'

// Optimistic auth gate for the role route groups (ADR 0003). Pages and RLS
// re-verify — this only routes: no session → /login; wrong role group → own home.
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
  if (!isProtectedPath(path)) return response

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile) {
    // Authenticated but not yet registered (e.g. mid-signup) — finish at login.
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const role = profile.role as Role
  if (!canAccess(role, path)) {
    return NextResponse.redirect(new URL(homeFor(role), request.url))
  }

  // Staff Users: per-screen allow-list (issue #2) — server-enforced, not just nav.
  const screen = screenKeyForPath(path)
  if (role === 'staff_user' && screen) {
    const { data: grants } = await supabase
      .from('staff_permissions')
      .select('screen_key')
      .eq('staff_user_id', user.id)
    const granted = (grants ?? []).map((g) => g.screen_key)
    if (!canOpenScreen(role, granted, screen)) {
      return NextResponse.redirect(new URL('/school/permission-denied', request.url))
    }
  }

  return response
}

export const config = {
  matcher: ['/school/:path*', '/dealer/:path*', '/super-admin/:path*', '/gov/:path*', '/school', '/dealer', '/super-admin', '/gov'],
}
