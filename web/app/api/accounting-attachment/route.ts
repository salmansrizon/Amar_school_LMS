import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireSchoolMember } from '@/lib/auth/require-role'

// Supabase storage client needs Node APIs.
export const runtime = 'nodejs'

const TABLES = { voucher: 'vouchers', asset: 'assets' } as const

/**
 * Opens a voucher or asset attachment (issue #35). The bucket is private, so
 * this authenticates, looks up the metadata row (RLS-scoped to the caller's
 * School), mints a short-lived signed URL, and redirects to it — same shape
 * as /api/syllabus (issue #45).
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const kind = url.searchParams.get('kind')
  const id = url.searchParams.get('id')
  if (!kind || !id || !(kind in TABLES)) return new Response('bad request', { status: 400 })

  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return new Response('forbidden', { status: 403 })

  const table = TABLES[kind as keyof typeof TABLES]
  const { data: row } = await supabase.from(table).select('attachment_path').eq('id', id).maybeSingle()
  if (!row?.attachment_path) return new Response('not found', { status: 404 })

  const { data: signed, error } = await supabase.storage
    .from('accounting-attachments')
    .createSignedUrl(row.attachment_path, 60 * 10)
  if (error || !signed?.signedUrl) return new Response('could not open file', { status: 500 })

  return NextResponse.redirect(signed.signedUrl)
}
