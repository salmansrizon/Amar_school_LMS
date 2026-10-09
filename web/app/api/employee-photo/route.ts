import type { NextRequest } from 'next/server'
import { signedObjectRoute } from '@/lib/storage/signed-object'

// Supabase storage client needs Node APIs.
export const runtime = 'nodejs'

// Opens an employee's photo (migration 0262) — private bucket, signed-URL
// redirect. Same guard as the student route: a School member, and RLS on
// `employees` decides whether the row (and so the path) is theirs to see.
// Before 0262 the column does not exist, the read yields no row, and this is
// a plain 404.
export const GET = signedObjectRoute((req: NextRequest) => {
  const id = new URL(req.url).searchParams.get('employee')
  if (!id) return new Response('employee is required', { status: 400 })
  return { bucket: 'employee-photos', table: 'employees', pathColumn: 'photo_path', match: { id } }
})
