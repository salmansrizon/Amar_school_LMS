// A Student's follow-up questions, kept pure.
//
// The table holds one question + one first reply per row. A conversation is:
//   * rows linked by thread_id (migration 0253): thread_id = the original's id,
//     and an original written since 0253 carries its own id;
//   * for rows with no thread_id (written before 0253, or while it is not
//     applied): the old convention, the Student's rows that share an anchor
//     (publication_id, else subject_id) and a normalised title.
// Ceiling of the convention, kept for old rows only: two unrelated old
// questions with the same title and anchor still merge.
//
// Further replies (student_message_replies, 0254) and the "seen" marks
// (student_message_reads, 0255) are optional inputs: without them the result
// is what it was before those migrations.

import { isAnswered, type MessageStatus } from '@/lib/student/messages'

export interface ThreadRow {
  id: string
  subject: string
  body: string
  status: MessageStatus
  reply_body: string | null
  replied_at: string | null
  created_at: string
  publication_id: string | null
  subject_id: string | null
  /** Absent until migration 0253; null on rows older than it. */
  thread_id?: string | null
}

/** A reply after the first one (student_message_replies). */
export interface ExtraReply {
  id: string
  message_id: string
  body: string
  created_at: string
}

export type ThreadStep =
  | { kind: 'asked'; at: string; body: string; rowId: string }
  | { kind: 'replied'; at: string | null; body: string; rowId: string }
  | { kind: 'waiting'; at: string; rowId: string }

export interface Conversation<R extends ThreadRow = ThreadRow> {
  /** The first row's id: the id `?view=` carries. */
  id: string
  /** Original question first, then follow-ups. */
  rows: R[]
  first: R
  last: R
  title: string
  answered: boolean
  lastActivity: string
  steps: ThreadStep[]
  /** A reply the Student has not opened yet (see hasNewReply). False when the
   *  seen marks are unknown. */
  newReply: boolean
  /** Rows of this conversation that carry a reply: what to mark as seen. */
  repliedRowIds: string[]
}

export function normaliseTitle(subject: string): string {
  return subject.trim().replace(/\s+/g, ' ').toLowerCase()
}

const anchorOf = (r: ThreadRow) => (r.publication_id ? `p:${r.publication_id}` : `s:${r.subject_id ?? ''}`)
export const threadKey = (r: ThreadRow) => `${anchorOf(r)}|${normaliseTitle(r.subject)}`

/** A reply counts as new for this long; older unseen replies are not flagged,
 *  so applying 0255 does not mark a Student's whole history as new. */
export const NEW_REPLY_DAYS = 14

/**
 * Is `replyAt` a reply the Student has not seen? `seenAt` is when they last
 * opened that question (undefined = never). Unparseable times are never new.
 */
export function hasNewReply(replyAt: string | null, seenAt: string | undefined, now: Date): boolean {
  if (!replyAt) return false
  const at = Date.parse(replyAt)
  if (Number.isNaN(at)) return false
  if (now.getTime() - at > NEW_REPLY_DAYS * 86_400_000) return false
  if (!seenAt) return true
  const seen = Date.parse(seenAt)
  return Number.isNaN(seen) || at > seen
}

/** The conversation a row belongs to: its thread when it has one, else the
 *  title convention. A follow-up joins whatever group its original is in. */
function groupKey<R extends ThreadRow>(r: R, byId: Map<string, R>): string {
  if (!r.thread_id) return threadKey(r)
  if (r.thread_id === r.id) return `t:${r.id}`
  const root = byId.get(r.thread_id)
  if (!root) return `t:${r.thread_id}`
  return root.thread_id === root.id ? `t:${root.id}` : threadKey(root)
}

/**
 * Group a Student's rows into conversations. Newest activity first.
 * `extra`: further replies, any order. `seen`: message id -> seen_at, or null
 * when unknown (0255 not applied), in which case nothing is flagged as new.
 */
export function buildConversations<R extends ThreadRow>(
  rows: R[],
  extra: ExtraReply[] = [],
  seen: Map<string, string> | null = null,
  now: Date = new Date(),
): Conversation<R>[] {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const extraByRow = new Map<string, ExtraReply[]>()
  for (const e of extra) {
    const list = extraByRow.get(e.message_id)
    if (list) list.push(e)
    else extraByRow.set(e.message_id, [e])
  }

  const groups = new Map<string, R[]>()
  for (const r of rows) {
    const k = groupKey(r, byId)
    const g = groups.get(k)
    if (g) g.push(r)
    else groups.set(k, [r])
  }
  const out = [...groups.values()].map((g) => {
    const sorted = [...g].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const steps: ThreadStep[] = []
    const repliedRowIds: string[] = []
    let newReply = false
    let lastActivity = first.created_at
    for (const r of sorted) {
      steps.push({ kind: 'asked', at: r.created_at, body: r.body, rowId: r.id })
      if (r.created_at > lastActivity) lastActivity = r.created_at
      const further = [...(extraByRow.get(r.id) ?? [])].sort(
        (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
      )
      const replies: { at: string | null; body: string }[] = [
        ...(r.reply_body ? [{ at: r.replied_at, body: r.reply_body }] : []),
        ...further.map((e) => ({ at: e.created_at, body: e.body })),
      ]
      if (replies.length) repliedRowIds.push(r.id)
      for (const reply of replies) {
        steps.push({ kind: 'replied', at: reply.at, body: reply.body, rowId: r.id })
        if (reply.at && reply.at > lastActivity) lastActivity = reply.at
        if (seen && hasNewReply(reply.at, seen.get(r.id), now)) newReply = true
      }
    }
    const answered = isAnswered(last)
    if (!answered) steps.push({ kind: 'waiting', at: last.created_at, rowId: last.id })
    return { id: first.id, rows: sorted, first, last, title: first.subject, answered, lastActivity, steps, newReply, repliedRowIds }
  })
  return out.sort((a, b) => b.lastActivity.localeCompare(a.lastActivity))
}

/** The conversation any of whose rows has this id (so an old ?q=<followup id> still opens). */
export function findConversation<R extends ThreadRow>(list: Conversation<R>[], rowId: string): Conversation<R> | null {
  return list.find((c) => c.rows.some((r) => r.id === rowId)) ?? null
}

/**
 * Teacher's side: the other messages of the same thread as `viewedId`, oldest
 * first. `threadOf` maps message id -> thread_id for rows that have one; a row
 * without one is its own thread, so old rows have no siblings (the title
 * convention is not applied across the inbox). Same Student only.
 */
export function threadSiblings<M extends { id: string; student_id: string; created_at: string }>(
  messages: M[],
  threadOf: Map<string, string>,
  viewedId: string,
): M[] {
  const viewed = messages.find((m) => m.id === viewedId)
  if (!viewed) return []
  const key = (m: M) => threadOf.get(m.id) ?? m.id
  const k = key(viewed)
  return messages
    .filter((m) => m.id !== viewedId && m.student_id === viewed.student_id && key(m) === k)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
}
