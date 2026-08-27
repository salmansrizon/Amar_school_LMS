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

/** Replacing work is delete-then-upload. The row goes first — RLS is what
 *  decides whether this Student may withdraw it at all — and the object follows
 *  through the Storage API. 0142 deleted the object from an `after delete`
 *  trigger instead, which the platform rejects ("Direct deletion from storage
 *  tables is not allowed"), taking the row delete down with it; 0155 drops that
 *  trigger. A failed object removal leaves an orphan the Student still owns and
 *  can overwrite, which is strictly better than a withdrawal that cannot
 *  happen. */
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
    .select('id, storage_path')
  if (error) return { error: error.message }
  // RLS refuses a reviewed submission, which surfaces here as zero rows.
  if (!data?.length) return { error: 'alreadyReviewed' }

  const path = data[0].storage_path as string | null
  if (path) await supabase.storage.from('submissions').remove([path])

  revalidatePath(`/student/tasks/${publicationId}`)
  return {}
}

export const submissionLimits = async () => ({
  maxBytes: MAX_SUBMISSION_BYTES,
  maxFiles: MAX_SUBMISSION_FILES,
})
