import type { SupabaseClient } from '@supabase/supabase-js'
import { photoExtension } from '@/lib/students'

// Profile pictures of people (Student, Employee): one private bucket per kind,
// one `photo_path` column on the person's table, one object per person at
// `{school_id}/{person_id}.{ext}`. Storage RLS keys on the first folder, so a
// path can only ever be read or written inside the caller's own School.
//
// HOW A LIST GETS ITS PICTURES (photoUrls below)
//   One PostgREST read for the ids on the current page (`id, photo_path`,
//   photo_path not null) and, only when at least one of them has a photo, ONE
//   Storage call (`createSignedUrls`) that signs all of them together. So a
//   list page costs at most 2 server round trips for pictures whatever its size
//   (10, 20 or 50 rows), and 0 Storage calls when nobody on the page has one.
//   Both run as the signed-in caller: the row read is RLS-scoped to the School
//   (and to the module grant), and Storage signs only objects the caller's
//   SELECT policy on storage.objects can see. The browser then loads each
//   picture straight from Storage, lazily, with no app route in between.
//
//   The alternative, `/api/student-photo?student=…` per <img>, is one request
//   per row, each with an auth check, a row read and a sign — fine for the one
//   picture on a profile, wrong for a list.
//
//   No image transformation: nothing in this codebase requests one, so the plan
//   is not assumed to have it. The stored object is already shrunk on upload
//   (lib/image/compress.ts, longest side 1200px, WebP) and the browser scales it.
//
// ponytail: a signed URL carries a fresh token on every render, so the browser
// cache does not survive a navigation. If list pictures get heavy, sign with a
// URL that is stable for a time window, or put thumbnails in a second object.

export const PHOTO_KINDS = {
  student: { bucket: 'student-photos', table: 'students', api: '/api/student-photo?student=', page: '/school/students' },
  employee: { bucket: 'employee-photos', table: 'employees', api: '/api/employee-photo?employee=', page: '/school/employees' },
} as const

export type PhotoKind = keyof typeof PHOTO_KINDS

/** A `kind` that arrived from the browser is only a string until checked. */
export function isPhotoKind(kind: unknown): kind is PhotoKind {
  return typeof kind === 'string' && Object.hasOwn(PHOTO_KINDS, kind)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The one place a photo's object path is built. Nothing the user typed goes
 *  in: the School comes from the caller's profile, the person id must be a
 *  UUID (so it cannot carry `/` or `..`), and the extension comes from the
 *  allowed MIME types — never from the file name. Null = not allowed. */
export function photoObjectPath(schoolId: string, personId: string, mimeType: string): string | null {
  const ext = photoExtension(mimeType)
  if (!ext || !UUID.test(schoolId) || !UUID.test(personId)) return null
  return `${schoolId}/${personId}.${ext}`
}

/** Which rows get a picture URL: only those that have a photo. */
export function rowsWithPhoto(rows: { id: string; photo_path?: string | null }[]): { id: string; path: string }[] {
  return rows.flatMap((r) => (r.photo_path ? [{ id: r.id, path: r.photo_path }] : []))
}

/** Signed results back onto person ids; a path Storage would not sign (object
 *  gone, or not the caller's) simply gets no URL, so its row shows the letter. */
export function urlsById(
  wanted: { id: string; path: string }[],
  signed: { path: string | null; signedUrl: string | null; error: string | null }[],
): Map<string, string> {
  const urlByPath = new Map(signed.flatMap((s) => (s.path && s.signedUrl && !s.error ? [[s.path, s.signedUrl] as const] : [])))
  return new Map(wanted.flatMap((w) => (urlByPath.has(w.path) ? [[w.id, urlByPath.get(w.path)!] as const] : [])))
}

/** The fallback rule for an <img> that is already in the page: finished
 *  loading with no pixels means broken (bad or expired URL), so the letter tile
 *  underneath must show. Catches an error that fired before hydration. */
export function photoBroken(img: { complete: boolean; naturalWidth: number }): boolean {
  return img.complete && img.naturalWidth === 0
}

// Long enough that a lazily loaded row scrolled into view late still opens.
const LIST_TTL_SECONDS = 60 * 60

/** person id → signed picture URL, for the rows on the current page only. Any
 *  failure — including the column or bucket not existing before migration 0262
 *  is applied — yields no URL, never an error: the list shows letter tiles. */
export async function photoUrls(supabase: SupabaseClient, kind: PhotoKind, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return new Map()
  const { bucket, table } = PHOTO_KINDS[kind]
  const { data, error } = await supabase.from(table).select('id, photo_path').in('id', unique).not('photo_path', 'is', null)
  if (error) return new Map()
  const wanted = rowsWithPhoto((data ?? []) as { id: string; photo_path: string | null }[])
  if (wanted.length === 0) return new Map()
  const { data: signed } = await supabase.storage.from(bucket).createSignedUrls(
    wanted.map((w) => w.path),
    LIST_TTL_SECONDS,
  )
  return urlsById(wanted, signed ?? [])
}
