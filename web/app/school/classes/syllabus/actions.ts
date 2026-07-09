'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// The file bytes are uploaded client-side straight to Storage (avoids the Next
// server-action body limit); these actions only manage the metadata row and the
// stored object. The storage path is derived server-side from the caller's
// School, never trusted from the client.

const PAGE = '/school/classes/syllabus'

function pathFor(schoolId: string, classId: string): string {
  return `${schoolId}/${classId}.pdf`
}

/** The deterministic object path a client must upload to for this class. */
export async function syllabusUploadPath(classId: string): Promise<{ path?: string; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const { data: profile } = await supabase.from('profiles').select('school_id').eq('id', user.id).single()
  if (!profile?.school_id) return { error: 'No school on profile' }
  // RLS-scoped: a class the caller can't see returns nothing.
  const { data: cls } = await supabase.from('classes').select('id').eq('id', classId).maybeSingle()
  if (!cls) return { error: 'Class not found' }
  return { path: pathFor(profile.school_id, classId) }
}

export async function recordSyllabus(classId: string, fileName: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const { data: profile } = await supabase.from('profiles').select('school_id').eq('id', user.id).single()
  if (!profile?.school_id) return { error: 'No school on profile' }
  const { data: cls } = await supabase.from('classes').select('id').eq('id', classId).maybeSingle()
  if (!cls) return { error: 'Class not found' }

  const { error } = await supabase.from('class_syllabi').upsert(
    {
      class_id: classId,
      storage_path: pathFor(profile.school_id, classId),
      file_name: fileName.slice(0, 200),
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
  if (row?.storage_path) {
    await supabase.storage.from('syllabus').remove([row.storage_path])
  }
  const { error } = await supabase.from('class_syllabi').delete().eq('class_id', classId)
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return {}
}
