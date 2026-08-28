import { signedObjectRoute, memberOrStudent } from '@/lib/storage/signed-object'

// Supabase storage client needs Node APIs.
export const runtime = 'nodejs'

// Serves the caller's own School logo for the print header (issue #92). No id
// parameter — a member only ever prints their own School's header, and RLS
// scopes the schools row to them.
//
// A Student is not a School member but prints the same header (fee statement,
// mark sheet, admit card), and `schools` is readable to them through their own
// policy — so the guard is member-or-student. Without this the logo 403s and
// every student print loses its letterhead.
export const GET = signedObjectRoute(
  () => ({
    bucket: 'school-logos',
    table: 'schools',
    pathColumn: 'logo_path',
  }),
  memberOrStudent,
)
