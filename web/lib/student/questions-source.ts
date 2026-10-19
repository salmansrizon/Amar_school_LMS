import type { SupabaseClient } from '@supabase/supabase-js'
import { isMissingColumnError } from '@/lib/leave-columns'
import type { ExtraReply, ThreadRow } from '@/lib/student/question-threads'

// Optional reads for the question pages (#703 items 5.2, 5.4, 5.6). Each one
// depends on a migration that may not be applied yet (0253, 0254, 0255) and
// answers "not available" instead of failing, so the pages keep today's
// behaviour until then. Same idea as attendance-source.ts.

type DbError = { code?: string; message?: string } | null | undefined

/** PostgREST "table not in the schema cache" (PGRST205) or Postgres
 *  undefined_table (42P01). */
export function isMissingRelationError(error: DbError): boolean {
  if (!error) return false
  if (error.code === 'PGRST205' || error.code === '42P01') return true
  return /relation .* does not exist|could not find the table/i.test(error.message ?? '')
}

const QUESTION_COLUMNS = 'id, subject, body, status, reply_body, replied_at, created_at, publication_id, subject_id'

/** The Student's own questions, with thread_id when 0253 is applied. */
export async function loadOwnQuestions(supabase: SupabaseClient): Promise<ThreadRow[]> {
  const read = (columns: string) =>
    supabase.from('student_messages').select(columns).order('created_at', { ascending: false }).returns<ThreadRow[]>()
  const withThread = await read(`${QUESTION_COLUMNS}, thread_id`)
  const res = isMissingColumnError(withThread.error) ? await read(QUESTION_COLUMNS) : withThread
  return res.data ?? []
}

/** Further replies the caller may read; null when 0254 is not applied (or the
 *  read failed), which hides the "add a reply" form. */
export async function loadExtraReplies(supabase: SupabaseClient, messageIds?: string[]): Promise<ExtraReply[] | null> {
  if (messageIds && messageIds.length === 0) return []
  let query = supabase.from('student_message_replies').select('id, message_id, body, created_at').order('created_at')
  if (messageIds) query = query.in('message_id', messageIds)
  const { data, error } = await query.limit(1000)
  if (error || !Array.isArray(data)) return null
  return data as ExtraReply[]
}

/** message id -> when the Student last opened it; null when 0255 is not
 *  applied (unknown, so nothing is flagged as new). */
export async function loadSeenMarks(supabase: SupabaseClient): Promise<Map<string, string> | null> {
  const { data, error } = await supabase.from('student_message_reads').select('message_id, seen_at')
  if (error || !Array.isArray(data)) return null
  return new Map((data as { message_id: string; seen_at: string }[]).map((r) => [r.message_id, r.seen_at]))
}

/** message id -> thread_id, for rows that have one (staff side). Empty when
 *  0253 is not applied. */
export async function loadThreadIds(supabase: SupabaseClient): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('student_messages')
    .select('id, thread_id')
    .not('thread_id', 'is', null)
    .limit(1000)
  if (error || !Array.isArray(data)) return new Map()
  return new Map((data as unknown as { id: string; thread_id: string }[]).map((r) => [r.id, r.thread_id]))
}
