import type { NextRequest } from 'next/server'
import { signedObjectRoute } from '@/lib/storage/signed-object'

// Supabase storage client needs Node APIs.
export const runtime = 'nodejs'

// Opens a student's photo (issue #27) — private bucket, signed-URL redirect.
export const GET = signedObjectRoute((req: NextRequest) => {
  const id = new URL(req.url).searchParams.get('student')
  if (!id) return new Response('student is required', { status: 400 })
  return { bucket: 'student-photos', table: 'students', pathColumn: 'photo_path', match: { id } }
})
