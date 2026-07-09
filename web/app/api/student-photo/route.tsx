import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireSchoolMember } from '@/lib/auth/require-role'

export const runtime = 'nodejs'

/**
 * Opens a student's photo (issue #27). The bucket is private, so this
 * authenticates, confirms a School member, looks up the photo path (RLS-scoped),
 * mints a short-lived signed URL and redirects to it.
 */
export async function GET(req: NextRequest) {
  const studentId = new URL(req.url).searchParams.get('student')
  if (!studentId) return new Response('student is required', { status: 400 })

  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return new Response('forbidden', { status: 403 })

  const { data: student } = await supabase
    .from('students')
    .select('photo_path')
    .eq('id', studentId)
    .maybeSingle()
  if (!student?.photo_path) return new Response('not found', { status: 404 })

  const { data: signed, error } = await supabase.storage
    .from('student-photos')
    .createSignedUrl(student.photo_path, 60 * 10)
  if (error || !signed?.signedUrl) return new Response('could not open photo', { status: 500 })

  return NextResponse.redirect(signed.signedUrl)
}
