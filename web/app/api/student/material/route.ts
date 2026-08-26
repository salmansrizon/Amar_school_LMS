import type { NextRequest } from 'next/server'
import { signedObjectRoute } from '@/lib/storage/signed-object'
import { isStudent } from '@/lib/student/guard'

// Supabase storage client needs Node APIs.
export const runtime = 'nodejs'

// A Student downloading study material (#447) with their own session — never a
// public bucket, never a shared link.
//
// The path always comes from `student_material`, the definer view that already
// decided what this Student may see. So the bucket is chosen by the row's own
// `source`, and a request naming another class's material resolves to no row
// and 404s rather than signing anything.
export const GET = signedObjectRoute((req: NextRequest) => {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  const source = url.searchParams.get('source')
  if (!id) return new Response('id is required', { status: 400 })
  if (source !== 'syllabus' && source !== 'publication') {
    return new Response('source must be syllabus or publication', { status: 400 })
  }
  return {
    bucket: source === 'syllabus' ? 'syllabus' : 'publications',
    table: 'student_material',
    pathColumn: 'storage_path',
    match: { id, source },
  }
}, isStudent)
