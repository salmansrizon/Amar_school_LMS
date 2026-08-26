'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getStudentContext, isReadOnly } from '@/lib/student/context'
import { requireSchoolMemberProfile } from '@/lib/auth/require-role'
import { pushInApp } from '@/lib/engines/notification/engine'
import { validateQuestion } from '@/lib/student/messages'

// Questions and replies (#454). Notifications go through the notification
// engine — pushInApp over the notification_push RPC — rather than inserting
// into `notifications` directly, so routing and the audit trail stay in one
// place (web/AGENTS.md: consume the engines).

/** A Student asking. The anchor is what makes the teacher's inbox groupable, so
 *  a question with neither anchor is refused here and by a CHECK constraint. */
export async function askQuestion(formData: FormData): Promise<{ error?: string }> {
  const ctx = await getStudentContext()
  if (isReadOnly(ctx)) return { error: 'readOnly' }

  const publicationId = String(formData.get('publication_id') ?? '') || null
  const subjectId = String(formData.get('subject_id') ?? '') || null
  const subject = String(formData.get('subject') ?? '')
  const body = String(formData.get('body') ?? '')

  const invalid = validateQuestion({ subject, body, publicationId, subjectId })
  if (invalid) return { error: invalid }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('student_messages')
    .insert({
      school_id: ctx.student.school_id,
      student_id: ctx.student.id,
      publication_id: publicationId,
      subject_id: subjectId,
      subject: subject.trim(),
      body: body.trim(),
    })
    .select('id')
    .single()
  if (error) return { error: error.message }

  // Tell the Class Teacher. A class with no teacher assigned, or a teacher with
  // no login, simply has nobody to notify — the question still lands, and the
  // School Owner reads every question in the school (#435).
  await notifyClassTeacher(supabase, ctx.student.school_id, ctx.student.class_name, ctx.student.section, subject.trim())

  revalidatePath('/student/questions')
  if (publicationId) revalidatePath(`/student/notices/${publicationId}`)
  return { }
}

async function notifyClassTeacher(
  supabase: Awaited<ReturnType<typeof createClient>>,
  schoolId: string,
  className: string | null,
  section: string | null,
  subject: string,
): Promise<void> {
  const { data } = await supabase.rpc('class_teacher_profile_for', {
    p_school: schoolId,
    p_class: className,
    p_section: section,
  })
  const recipient = data as string | null
  if (!recipient) return
  await pushInApp(supabase, {
    recipientId: recipient,
    schoolId,
    title: 'New question from a student',
    body: subject,
  }).catch(() => {
    // The question is already saved; a notification failure must not look to
    // the student like their question did not send.
  })
}

/** A teacher (or the Owner) answering. One reply, and answering is final —
 *  status moves to 'answered' and the reply is what the Student reads. */
export async function answerQuestion(
  messageId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { ok, schoolId } = await requireSchoolMemberProfile(supabase)
  if (!ok) return { error: 'Unauthorized' }

  const reply = String(formData.get('reply_body') ?? '').trim()
  if (!reply) return { error: 'A reply is required' }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('student_messages')
    .update({
      reply_body: reply,
      replied_by: user?.id ?? null,
      replied_at: new Date().toISOString(),
      status: 'answered',
    })
    .eq('id', messageId)
    .select('student_id, subject')
    .single()
  if (error) return { error: error.message }

  const { data: profileId } = await supabase.rpc('student_profile_for', { p_student: data.student_id })
  if (profileId) {
    await pushInApp(supabase, {
      recipientId: profileId as string,
      schoolId,
      title: 'Your teacher replied',
      body: data.subject,
    }).catch(() => {})
  }

  revalidatePath('/school/questions')
  return {}
}
