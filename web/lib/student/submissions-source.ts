'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getStudentContext, isReadOnly } from '@/lib/student/context'
import { MAX_SUBMISSION_BYTES, MAX_SUBMISSION_FILES, submissionExtension } from '@/lib/student/submissions'

// Submission writes (#448). The upload itself is client-direct to Storage; this
// records the row, and the row is what the caps and tenancy trigger guard.

/** Derives the storage path server-side. The client never chooses where its own
 *  file lands — the first two folders are the tenancy check the storage
 *  policies key on, so a client-supplied path would be the whole hole. */
export async function submissionUploadPath(
  publicationId: string,
  mimeType: string,
): Promise<{ path?: string; schoolId?: string; error?: string }> {
  const ctx = await getStudentContext()
  if (isReadOnly(ctx)) return { error: 'readOnly' }

  const ext = submissionExtension(mimeType)
  if (!ext) return { error: 'type' }

  const { student } = ctx
  return {
    path: `${student.school_id}/${student.id}/${publicationId}/${crypto.randomUUID()}.${ext}`,
    schoolId: student.school_id,
  }
}

export async function recordSubmission(input: {
  publicationId: string
  storagePath: string
  fileName: string
  fileSize: number
  note?: string | null
}): Promise<{ error?: string }> {
  const ctx = await getStudentContext()
  if (isReadOnly(ctx)) return { error: 'readOnly' }
  if (input.fileSize > MAX_SUBMISSION_BYTES) return { error: 'size' }

  const supabase = await createClient()
  const { error } = await supabase.from('homework_submissions').insert({
    school_id: ctx.student.school_id,
    publication_id: input.publicationId,
    student_id: ctx.student.id,
    storage_path: input.storagePath,
    file_name: input.fileName,
    file_size: input.fileSize,
    note: input.note ?? null,
  })
  // The trigger is the authority on both caps; surface its message rather than
  // guessing which one tripped.
  if (error) return { error: error.message }

  revalidatePath(`/student/tasks/${input.publicationId}`)
  return {}
}

/** Replacing work is delete-then-upload. Deleting the row deletes the object
 *  (0142's cleanup trigger), so there is no orphan to sweep later. */
export async function withdrawSubmission(
  id: string,
  publicationId: string,
): Promise<{ error?: string }> {
  const ctx = await getStudentContext()
  if (isReadOnly(ctx)) return { error: 'readOnly' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('homework_submissions')
    .delete()
    .eq('id', id)
    .select('id')
  if (error) return { error: error.message }
  // RLS refuses a reviewed submission, which surfaces here as zero rows.
  if (!data?.length) return { error: 'alreadyReviewed' }

  revalidatePath(`/student/tasks/${publicationId}`)
  return {}
}

export const submissionLimits = async () => ({
  maxBytes: MAX_SUBMISSION_BYTES,
  maxFiles: MAX_SUBMISSION_FILES,
})
