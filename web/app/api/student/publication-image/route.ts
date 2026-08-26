import type { NextRequest } from 'next/server'
import { signedObjectRoute } from '@/lib/storage/signed-object'
import { isStudent } from '@/lib/student/guard'

// Supabase storage client needs Node APIs.
export const runtime = 'nodejs'

// A Student opening the image on a notice addressed to them (#445).
//
// Separate route from /api/publication-image only because the guard differs —
// the signing policy itself is shared. WHICH publication they may open is
// decided by RLS on `publications`, so a notice targeted at another class
// resolves to no row and returns 404, never a signed URL.
export const GET = signedObjectRoute((req: NextRequest) => {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return new Response('id is required', { status: 400 })
  return { bucket: 'publications', table: 'publications', pathColumn: 'image_path', match: { id } }
}, isStudent)
