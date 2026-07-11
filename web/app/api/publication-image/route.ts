import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireSchoolMember } from '@/lib/auth/require-role'

// Supabase storage client needs Node APIs.
export const runtime = 'nodejs'

/**
 * Opens a publication's optional image (issue #37). The bucket is private, so
 * this authenticates, looks up the metadata row (RLS-scoped to the caller's
 * School), mints a short-lived signed URL, and redirects to it — same shape
 * as /api/syllabus from issue #45.
 */
export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return new Response('id is required', { status: 400 })

  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return new Response('forbidden', { status: 403 })

  const { data: row } = await supabase
    .from('publications')
    .select('image_path')
    .eq('id', id)
    .maybeSingle()
  if (!row?.image_path) return new Response('not found', { status: 404 })

  const { data: signed, error } = await supabase.storage
    .from('publications')
    .createSignedUrl(row.image_path, 60 * 10)
  if (error || !signed?.signedUrl) return new Response('could not open file', { status: 500 })

  return NextResponse.redirect(signed.signedUrl)
}
