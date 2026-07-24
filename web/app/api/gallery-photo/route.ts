import type { NextRequest } from 'next/server'
import { signedObjectRoute } from '@/lib/storage/signed-object'

// Supabase storage client needs Node APIs.
export const runtime = 'nodejs'

// Opens a gallery photo (issue #37) — private bucket, signed-URL redirect.
export const GET = signedObjectRoute((req: NextRequest) => {
  const id = new URL(req.url).searchParams.get('photo')
  if (!id) return new Response('photo is required', { status: 400 })
  return { bucket: 'gallery', table: 'gallery_photos', pathColumn: 'storage_path', match: { id } }
})
