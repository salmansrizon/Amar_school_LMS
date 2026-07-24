import type { NextRequest } from 'next/server'
import { signedObjectRoute } from '@/lib/storage/signed-object'

// Supabase storage client needs Node APIs.
export const runtime = 'nodejs'

// Opens a publication's optional image (issue #37) — private bucket, signed-URL redirect.
export const GET = signedObjectRoute((req: NextRequest) => {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return new Response('id is required', { status: 400 })
  return { bucket: 'publications', table: 'publications', pathColumn: 'image_path', match: { id } }
})
