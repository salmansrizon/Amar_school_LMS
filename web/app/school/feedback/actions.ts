'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { statusOnOpen, statusOnReply, type FeedbackStatus } from '@/lib/feedback'
import { emailGateway } from '@/lib/email/gateway'

// RLS ("school members manage …" scoped to app_current_school_id(), migration
// 0037) is the authority on every write here — these actions only validate,
// shape input, and drive the unread/read/answered state machine (lib/feedback.ts).

const INBOX_PAGE = '/school/feedback'
const RATINGS_PAGE = '/school/feedback/ratings'

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? '').trim()
}

function optStr(fd: FormData, key: string): string | null {
  const v = str(fd, key)
  return v.length ? v : null
}

function optInt(fd: FormData, key: string): number | null {
  const v = str(fd, key)
  if (!v) return null
  const n = Number(v)
  return Number.isInteger(n) ? n : null
}

/** No parent portal exists yet (map issue #24) — staff log inbound items on
 * behalf of however the guardian actually reached them (phone/in-person/paper),
 * mirroring how behaviour_log_entries records incidents. */
export async function logFeedbackMessage(formData: FormData): Promise<{ error?: string }> {
  const senderName = str(formData, 'sender_name')
  const subject = str(formData, 'subject')
  const body = str(formData, 'body')
  if (!senderName) return { error: 'Sender name is required' }
  if (!subject) return { error: 'Subject is required' }
  if (!body) return { error: 'Message is required' }

  const supabase = await createClient()
  const { error } = await supabase.from('feedback_messages').insert({
    sender_name: senderName,
    sender_role: optStr(formData, 'sender_role'),
    sender_contact: optStr(formData, 'sender_contact'),
    sender_email: optStr(formData, 'sender_email'),
    subject,
    body,
  })
  if (error) return { error: error.message }
  revalidatePath(INBOX_PAGE)
  return {}
}

/** Opening a message for the first time reads it (statusOnOpen: unread -> read). */
export async function markFeedbackRead(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: existing, error: fetchError } = await supabase
    .from('feedback_messages')
    .select('status')
    .eq('id', id)
    .single()
  if (fetchError || !existing) return { error: fetchError?.message ?? 'Not found' }

  const next = statusOnOpen(existing.status as FeedbackStatus)
  if (next === existing.status) return {}

  const { error } = await supabase
    .from('feedback_messages')
    .update({ status: next, read_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(INBOX_PAGE)
  return {}
}

/** Replying always lands on 'answered' (statusOnReply) and dispatches an email
 * when the sender left an address — the stored reply is the source of truth
 * regardless of send outcome (issue #38: keep the email side minimal/isolated). */
export async function replyToFeedback(formData: FormData): Promise<{ error?: string }> {
  const id = str(formData, 'id')
  const replyBody = str(formData, 'reply_body')
  if (!id) return { error: 'Missing message id' }
  if (!replyBody) return { error: 'Reply text is required' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: existing, error: fetchError } = await supabase
    .from('feedback_messages')
    .select('status, sender_email, subject')
    .eq('id', id)
    .single()
  if (fetchError || !existing) return { error: fetchError?.message ?? 'Not found' }

  const nextStatus = statusOnReply(existing.status as FeedbackStatus)
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('feedback_messages')
    .update({
      status: nextStatus,
      reply_body: replyBody,
      replied_by: user.id,
      replied_at: now,
      read_at: now,
    })
    .eq('id', id)
  if (error) return { error: error.message }

  if (existing.sender_email) {
    await emailGateway().send(existing.sender_email, `Re: ${existing.subject}`, replyBody)
  }

  revalidatePath(INBOX_PAGE)
  return {}
}

/** Institute-scope satisfaction rating (PRD §5.9). Application-scope rows are
 * schema-supported (migration 0037) but have no entry point in this ticket —
 * no vendor-side aggregate UI is mocked for #38. */
export async function logSatisfactionRating(formData: FormData): Promise<{ error?: string }> {
  const overall = Number(formData.get('overall_rating'))
  if (!Number.isInteger(overall) || overall < 1 || overall > 5) {
    return { error: 'Overall rating must be a whole number from 1 to 5' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('satisfaction_ratings').insert({
    overall_rating: overall,
    category_teaching: optInt(formData, 'category_teaching'),
    category_facilities: optInt(formData, 'category_facilities'),
    category_communication: optInt(formData, 'category_communication'),
    category_safety: optInt(formData, 'category_safety'),
    sender_name: optStr(formData, 'sender_name'),
  })
  if (error) return { error: error.message }
  revalidatePath(RATINGS_PAGE)
  return {}
}
