'use server'

import { revalidatePath } from 'next/cache'
import { currentActor } from '@/lib/school/actor'
import { createSignedUpload, type SignedUpload } from '@/lib/storage/signed-upload'
import { PHOTO_KINDS, isPhotoKind, photoObjectPath, type PhotoKind } from '@/lib/photos'
import { photoExtension } from '@/lib/students'

// Photo upload for a person (Student, Employee). Moved here from
// students/actions.ts and given a `kind`, so the Employee photo (migration
// 0262) runs through the very same two steps instead of a copy of them.
//
// RLS is the authority throughout: the row read and the row update run as the
// caller on the person's table, and Storage issues the upload token only if the
// caller's INSERT/UPDATE policy on storage.objects allows that exact path.

// The same literals the Student and Employee actions already return.
const NOT_FOUND = { student: 'Student not found', employee: 'Employee not found' } as const

/** The deterministic object path for a person's photo.
 *
 *  Shared by the upload ticket and by recordPhoto, which needs the same string
 *  afterwards. Split out when the ticket started minting a signed token:
 *  re-calling the exported function to recompute a path would have issued a fresh
 *  upload credential purely as a side effect of wanting a filename.
 *
 *  Server-derived: the School comes from the caller's profile, the id is checked
 *  against a row the caller can read, the extension comes from the MIME type.
 *  Nothing is taken from the file name, and `kind` arrives from the browser so
 *  it is checked before it picks a table or a bucket. */
async function personPhotoPath(
  kind: PhotoKind,
  personId: string,
  mimeType: string,
): Promise<{ path?: string; error?: string }> {
  if (!isPhotoKind(kind)) return { error: 'Not found' }
  const actor = await currentActor()
  if ('error' in actor) return { error: actor.error }
  const path = photoObjectPath(actor.schoolId, personId, mimeType)
  // No path: either not an allowed image, or an id that is not a UUID.
  if (!path) return { error: photoExtension(mimeType) ? NOT_FOUND[kind] : 'JPEG, PNG or WebP only' }
  const { data: person } = await actor.supabase
    .from(PHOTO_KINDS[kind].table)
    .select('id')
    .eq('id', personId)
    .maybeSingle()
  if (!person) return { error: NOT_FOUND[kind] }
  return { path }
}

export async function photoUploadTicket(
  kind: PhotoKind,
  personId: string,
  mimeType: string,
): Promise<{ upload?: SignedUpload; error?: string }> {
  const { path, error } = await personPhotoPath(kind, personId, mimeType)
  if (error || !path) return { error: error ?? NOT_FOUND[kind] }
  return createSignedUpload(PHOTO_KINDS[kind].bucket, path)
}

/** Records the uploaded photo's path on the person's row (after upload). */
export async function recordPhoto(
  kind: PhotoKind,
  personId: string,
  mimeType: string,
): Promise<{ error?: string }> {
  const { path, error: pathError } = await personPhotoPath(kind, personId, mimeType)
  if (pathError || !path) return { error: pathError ?? NOT_FOUND[kind] }
  const actor = await currentActor()
  if ('error' in actor) return { error: actor.error }
  const { table, page } = PHOTO_KINDS[kind]
  const { error } = await actor.supabase.from(table).update({ photo_path: path }).eq('id', personId)
  if (error) return { error: error.message }
  revalidatePath(page)
  revalidatePath(`${page}/${personId}`)
  return {}
}
