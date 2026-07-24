import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { homeFor, type Role } from '@/lib/auth/routing'

// Target of Supabase email links (signup confirmation, password reset).
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next')

  const supabase = await createClient()
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) return NextResponse.redirect(new URL('/login', url.origin))
  }

  // Same-origin paths only — an absolute URL in ?next would be an open redirect.
  if (next && next.startsWith('/') && !next.startsWith('//')) {
    return NextResponse.redirect(new URL(next, url.origin))
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', url.origin))

  // Self-service registration was removed (issue #111, decision #107). An
  // unbound confirmed user is a school owner who must redeem a claim code.
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const dest = profile ? homeFor(profile.role as Role) : '/claim'
  return NextResponse.redirect(new URL(dest, url.origin))
}
