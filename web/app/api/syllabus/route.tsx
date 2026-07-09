import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireSchoolMember } from '@/lib/auth/require-role'

// Supabase storage client needs Node APIs.
export const runtime = 'nodejs'

/**
 * Opens a class's syllabus PDF (issue #45). The bucket is private, so this
 * authenticates, looks up the metadata row (RLS-scoped to the caller's School),
 * mints a short-lived signed URL, and redirects to it.
 */
export async function GET(req: NextRequest) {
  const classId = new URL(req.url).searchParams.get('class')
  if (!classId) return new Response('class is required', { status: 400 })

  const supabase = await createClient()
  // Same access gate as the /school pages: a School member only (RLS scopes the
  // row to their School as well). Consistent with the fee-receipt page.
  if (!(await requireSchoolMember(supabase))) return new Response('forbidden', { status: 403 })

  const { data: row } = await supabase
    .from('class_syllabi')
    .select('storage_path')
    .eq('class_id', classId)
    .maybeSingle()
  if (!row?.storage_path) return new Response('not found', { status: 404 })

  const { data: signed, error } = await supabase.storage
    .from('syllabus')
    .createSignedUrl(row.storage_path, 60 * 10)
  if (error || !signed?.signedUrl) return new Response('could not open file', { status: 500 })

  return NextResponse.redirect(signed.signedUrl)
}
