'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getStudentContext, isReadOnly } from '@/lib/student/context'
import { requireSchoolMemberProfile } from '@/lib/auth/require-role'
import { pushInApp } from '@/lib/engines/notification/engine'
import { QUESTION_BODY_MAX, validateQuestion } from '@/lib/student/messages'
import { isMissingColumnError } from '@/lib/leave-columns'
import { isMissingRelationError } from '@/lib/student/questions-source'

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
  const row = {
    school_id: ctx.student.school_id,
    student_id: ctx.student.id,
    publication_id: publicationId,
    subject_id: subjectId,
    subject: subject.trim(),
    body: body.trim(),
  }
  // #703 item 5.4: a follow-up carries its original's id; a new question is
  // its own thread. The id is made here so the row can name itself.
  const id = crypto.randomUUID()
  const threadId = String(formData.get('thread_id') ?? '') || id
  let { error } = await supabase.from('student_messages').insert({ ...row, id, thread_id: threadId })
  // Migration 0253 not applied: send it as before (grouped by anchor and title).
  if (isMissingColumnError(error)) ({ error } = await supabase.from('student_messages').insert(row))
  if (error) return { error: error.message }

  // Tell the Class Teacher. A class with no teacher assigned, or a teacher with
  // no login, simply has nobody to notify — the question still lands, and the
  // School Owner reads every question in the school (#435).
  await notifyClassTeacher(supabase, ctx.student.school_id, subject.trim())

  revalidatePath('/student/questions')
  if (publicationId) revalidatePath(`/student/notices/${publicationId}`)
  return { }
}

async function notifyClassTeacher(
  supabase: Awaited<ReturnType<typeof createClient>>,
  schoolId: string,
  subject: string,
): Promise<void> {
  // Resolves via the calling Student's own current Enrollment (issue #593),
  // not the (name, section) text this used to take — the RPC takes no
  // parameters, deliberately (see 0189's own comment): it can only ever
  // answer for whoever is authenticated right now.
  const { data } = await supabase.rpc('class_teacher_profile_for')
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
 *  status moves to 'answered' and the reply is what the Student reads.
 *
 *  Who may answer is decided in RLS (0152, ADR 0018): the Owner, the Class
 *  Teacher of the asking student's class, or a Subject Teacher whose own subject
 *  or publication the question is anchored to. A refusal comes back as zero rows
 *  updated rather than an error, so it is turned into a legible message here —
 *  `.single()` would have surfaced it as PGRST116. */
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
    .maybeSingle()
  if (error) return { error: error.message }
  if (!data) return { error: 'notYours' }

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

/** A further reply to a question that already has its first one (#703 item
 *  5.6, migration 0254). Stored in student_message_replies; the first reply,
 *  the status and the reply time are not touched. Who may add one is the same
 *  rule as answering (staff_may_answer_message, in the insert policy). While
 *  0254 is not applied this refuses, rather than overwrite the first reply. */
export async function addReply(messageId: string, formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { ok, schoolId } = await requireSchoolMemberProfile(supabase)
  if (!ok) return { error: 'Unauthorized' }

  const reply = String(formData.get('reply_body') ?? '').trim()
  if (!reply) return { error: 'A reply is required' }
  if (reply.length > QUESTION_BODY_MAX) return { error: 'bodyTooLong' }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('student_message_replies')
    .insert({ message_id: messageId, body: reply, replied_by: user?.id ?? null })
  if (isMissingRelationError(error)) return { error: 'replyUnavailable' }
  // 42501: the insert policy refused (not theirs to answer, or no first reply yet).
  if (error) return { error: error.code === '42501' ? 'notYours' : error.message }

  const { data: message } = await supabase
    .from('student_messages')
    .select('student_id, subject')
    .eq('id', messageId)
    .maybeSingle()
  if (message) {
    const { data: profileId } = await supabase.rpc('student_profile_for', { p_student: message.student_id })
    if (profileId) {
      await pushInApp(supabase, {
        recipientId: profileId as string,
        schoolId,
        title: 'Your teacher replied',
        body: message.subject,
      }).catch(() => {})
    }
  }

  revalidatePath('/school/questions')
  return {}
}

/** A Student withdrawing their own unanswered question (#703 item 5.8,
 *  migration 0257). The delete policy decides; zero rows deleted means it was
 *  refused (already answered, not theirs, or 0257 not applied). */
export async function withdrawQuestion(messageId: string): Promise<{ error?: string }> {
  const ctx = await getStudentContext()
  if (isReadOnly(ctx)) return { error: 'readOnly' }
  const { data, error } = await ctx.supabase
    .from('student_messages')
    .delete()
    .eq('id', messageId)
    .eq('student_id', ctx.student.id)
    .select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'cannotWithdraw' }
  revalidatePath('/student/questions')
  return {}
}

/** Record that the Student has opened these questions, so their replies stop
 *  showing as new (#703 item 5.2, migration 0255). Best effort: it stores
 *  nothing the Student typed, so a failure (or 0255 not applied) is silent. */
export async function markQuestionsSeen(messageIds: string[]): Promise<void> {
  const ids = messageIds.filter((id) => typeof id === 'string' && id).slice(0, 50)
  if (!ids.length) return
  const ctx = await getStudentContext()
  if (isReadOnly(ctx)) return
  const seenAt = new Date().toISOString()
  await ctx.supabase
    .from('student_message_reads')
    .upsert(
      ids.map((id) => ({ message_id: id, student_id: ctx.student.id, seen_at: seenAt })),
      { onConflict: 'message_id' },
    )
}
