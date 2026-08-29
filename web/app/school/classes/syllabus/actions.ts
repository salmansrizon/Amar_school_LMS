'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createSignedUpload, type SignedUpload } from '@/lib/storage/signed-upload'
import { currentActor } from '@/lib/school/actor'

// The file bytes are uploaded client-side straight to Storage (avoids the Next
// server-action body limit); these actions only manage the metadata row and the
// stored object. The storage path is derived server-side from the caller's
// School, never trusted from the client.

const PAGE = '/school/classes/syllabus'
const MAX_BYTES = 10 * 1024 * 1024 // mirrors the bucket's server-enforced cap

function pathFor(schoolId: string, classId: string): string {
  return `${schoolId}/${classId}.pdf`
}

async function ownPath(classId: string): Promise<{ path?: string; error?: string }> {
  const actor = await currentActor()
  if ('error' in actor) return { error: actor.error }
  // RLS-scoped: a class the caller can't see returns nothing.
  const { data: cls } = await actor.supabase.from('classes').select('id').eq('id', classId).maybeSingle()
  if (!cls) return { error: 'Class not found' }
  return { path: pathFor(actor.schoolId, classId) }
}

/** A one-shot permission to write this class's syllabus object.
 *
 *  Was `syllabusUploadPath`, which returned only the path and left the browser to
 *  authorise itself with its own session. That works only while the session cookie
 *  is readable by page JavaScript, which is the #526 finding #527 removes. The
 *  authorisation moves here; the bytes still go straight to Storage (#527).
 *
 *  Who may write is unchanged: this runs as the signed-in caller, so the class
 *  lookup above and Storage RLS decide whether a token is issued at all. */
export async function syllabusUploadTicket(
  classId: string,
): Promise<{ upload?: SignedUpload; error?: string }> {
  const { path, error } = await ownPath(classId)
  if (error || !path) return { error: error ?? 'Class not found' }
  return createSignedUpload('syllabus', path)
}

export async function recordSyllabus(
  classId: string,
  fileName: string,
  fileSize: number,
): Promise<{ error?: string }> {
  const { path, error: pathError } = await ownPath(classId)
  if (pathError || !path) return { error: pathError ?? 'Class not found' }
  if (!Number.isInteger(fileSize) || fileSize < 1 || fileSize > MAX_BYTES)
    return { error: 'Invalid file size' }

  const supabase = await createClient()
  const { error } = await supabase.from('class_syllabi').upsert(
    {
      class_id: classId,
      storage_path: path,
      file_name: fileName.slice(0, 200),
      file_size: fileSize,
      uploaded_at: new Date().toISOString(),
    },
    { onConflict: 'class_id' },
  )
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return {}
}

export async function deleteSyllabus(classId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: row } = await supabase
    .from('class_syllabi')
    .select('storage_path')
    .eq('class_id', classId)
    .maybeSingle()
  if (!row) return { error: 'Not found' }
  // DB row first: if this fails nothing changed; if the Storage remove after it
  // fails, the object is an invisible orphan (re-upload overwrites it) rather
  // than a ghost list entry pointing at a missing file.
  const { error } = await supabase.from('class_syllabi').delete().eq('class_id', classId)
  if (error) return { error: error.message }
  // Storage RLS confines the delete to the caller's own School folder.
  await supabase.storage.from('syllabus').remove([row.storage_path])
  revalidatePath(PAGE)
  return {}
}
