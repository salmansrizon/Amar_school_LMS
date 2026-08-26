'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireSchoolMemberProfile } from '@/lib/auth/require-role'

/** A teacher recording marks and/or a comment against one submission (#448).
 *  Both are optional; recording either stamps the review so the Student can no
 *  longer withdraw the work out from under it. */
export async function reviewSubmission(
  submissionId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { ok } = await requireSchoolMemberProfile(supabase)
  if (!ok) return { error: 'Unauthorized' }

  const rawMarks = String(formData.get('marks') ?? '').trim()
  const marks = rawMarks === '' ? null : Number(rawMarks)
  if (marks !== null && (!Number.isFinite(marks) || marks < 0)) {
    return { error: 'Marks must be zero or a positive number' }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('homework_submissions')
    .update({
      marks,
      teacher_comment: String(formData.get('teacher_comment') ?? '').trim() || null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user?.id ?? null,
    })
    .eq('id', submissionId)
    .select('publication_id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Submission not found' }

  revalidatePath(`/school/my-classes/tasks/${data[0].publication_id}`)
  return {}
}
