import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireSchoolMember } from '@/lib/auth/require-role'

// Supabase storage client needs Node APIs.
export const runtime = 'nodejs'

/**
 * Serves the caller's own School logo for the print header (issue #92). Same
 * pattern as /api/student-photo: the bucket is private, so authenticate, read
 * the RLS-scoped `schools` row, mint a short-lived signed URL and redirect.
 * No id parameter — a member only ever prints their own School's header.
 */
export async function GET() {
  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return new Response('forbidden', { status: 403 })

  const { data: row } = await supabase.from('schools').select('logo_path').maybeSingle()
  if (!row?.logo_path) return new Response('not found', { status: 404 })

  const { data: signed, error } = await supabase.storage
    .from('school-logos')
    .createSignedUrl(row.logo_path, 60 * 10)
  if (error || !signed?.signedUrl) return new Response('could not open file', { status: 500 })

  return NextResponse.redirect(signed.signedUrl)
}
