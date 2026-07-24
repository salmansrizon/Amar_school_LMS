import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireSchoolMember } from '@/lib/auth/require-role'

// The one seam behind every "open a private file" route (student photo, gallery
// photo, publication image, accounting attachment, school logo, syllabus). Each
// of those buckets is private, so the shape is always the same: authenticate as
// a School member, look up the RLS-scoped metadata row that holds the object
// path, mint a short-lived signed URL, and redirect to it. That five-step shape
// used to be copy-pasted per route; it lives here once now, so a change to the
// signing policy (TTL, the guard, the error contract) is a single edit, and the
// per-route code shrinks to "which bucket / table / column, keyed by what".

const DEFAULT_TTL_SECONDS = 60 * 10

/** Where a private object lives and how to find its path. RLS still scopes the
 *  row to the caller's School — `match` only narrows to the specific record. */
export interface SignedObjectSpec {
  bucket: string
  /** Metadata table holding the object path. */
  table: string
  /** Column on that table holding the storage path. */
  pathColumn: string
  /** Equality filters (column → value), e.g. `{ id }` or `{ class_id }`. Omit
   *  for a singleton row like the caller's own School (RLS picks the one row). */
  match?: Record<string, string>
  ttlSeconds?: number
}

/** A resolver turns the request into a spec, or returns an early `Response` for
 *  a bad/missing parameter (before any auth or DB work). */
type SpecResolver = (req: NextRequest) => SignedObjectSpec | Response

/**
 * Builds a GET route handler that serves a private storage object as a redirect
 * to a signed URL. Usage:
 *
 *   export const GET = signedObjectRoute((req) => {
 *     const id = new URL(req.url).searchParams.get('student')
 *     if (!id) return new Response('student is required', { status: 400 })
 *     return { bucket: 'student-photos', table: 'students', pathColumn: 'photo_path', match: { id } }
 *   })
 *
 * The route file still sets `export const runtime = 'nodejs'` (storage needs it).
 */
export function signedObjectRoute(resolve: SpecResolver) {
  return async function GET(req: NextRequest): Promise<Response> {
    const spec = resolve(req)
    if (spec instanceof Response) return spec

    const supabase = await createClient()
    if (!(await requireSchoolMember(supabase))) return new Response('forbidden', { status: 403 })

    let query = supabase.from(spec.table).select(spec.pathColumn)
    for (const [column, value] of Object.entries(spec.match ?? {})) query = query.eq(column, value)
    const { data: row } = await query.maybeSingle()

    const path = (row as Record<string, string | null> | null)?.[spec.pathColumn]
    if (!path) return new Response('not found', { status: 404 })

    const { data: signed, error } = await supabase.storage
      .from(spec.bucket)
      .createSignedUrl(path, spec.ttlSeconds ?? DEFAULT_TTL_SECONDS)
    if (error || !signed?.signedUrl) return new Response('could not open file', { status: 500 })

    return NextResponse.redirect(signed.signedUrl)
  }
}
