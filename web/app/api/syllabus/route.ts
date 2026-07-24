import type { NextRequest } from 'next/server'
import { signedObjectRoute } from '@/lib/storage/signed-object'

// Supabase storage client needs Node APIs.
export const runtime = 'nodejs'

// Opens a class's syllabus PDF (issue #45) — private bucket, signed-URL redirect.
export const GET = signedObjectRoute((req: NextRequest) => {
  const classId = new URL(req.url).searchParams.get('class')
  if (!classId) return new Response('class is required', { status: 400 })
  return { bucket: 'syllabus', table: 'class_syllabi', pathColumn: 'storage_path', match: { class_id: classId } }
})
