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

  if (next) return NextResponse.redirect(new URL(next, url.origin))

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', url.origin))

  // First confirmed visit after signup: create the School + owner profile.
  let { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile) {
    const schoolName = user.user_metadata?.school_name
    if (typeof schoolName === 'string' && schoolName.trim()) {
      const { error: rpcError } = await supabase.rpc('register_school', {
        school_name: schoolName.trim(),
      })
      if (!rpcError) profile = { role: 'school_owner' }
    }
  }

  const dest = profile ? homeFor(profile.role as Role) : '/login'
  return NextResponse.redirect(new URL(dest, url.origin))
}
