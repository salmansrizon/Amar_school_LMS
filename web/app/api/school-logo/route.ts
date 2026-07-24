import { signedObjectRoute } from '@/lib/storage/signed-object'

// Supabase storage client needs Node APIs.
export const runtime = 'nodejs'

// Serves the caller's own School logo for the print header (issue #92). No id
// parameter — a member only ever prints their own School's header, and RLS
// scopes the schools row to them.
export const GET = signedObjectRoute(() => ({
  bucket: 'school-logos',
  table: 'schools',
  pathColumn: 'logo_path',
}))
