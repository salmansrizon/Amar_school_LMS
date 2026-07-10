'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

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
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('school_id')
    .eq('id', user.id)
    .single()
  if (!profile?.school_id) return { error: 'No school on profile' }
  // RLS-scoped: a class the caller can't see returns nothing.
  const { data: cls } = await supabase.from('classes').select('id').eq('id', classId).maybeSingle()
  if (!cls) return { error: 'Class not found' }
  return { path: pathFor(profile.school_id, classId) }
}

/** The deterministic object path a client must upload to for this class. */
export async function syllabusUploadPath(classId: string): Promise<{ path?: string; error?: string }> {
  return ownPath(classId)
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
  // Storage RLS confines the delete to the caller's own School folder.
  const { error: rmError } = await supabase.storage.from('syllabus').remove([row.storage_path])
  if (rmError) return { error: rmError.message }
  const { error } = await supabase.from('class_syllabi').delete().eq('class_id', classId)
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return {}
}
