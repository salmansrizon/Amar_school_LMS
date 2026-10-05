// A Student's follow-up questions, kept pure.
//
// ponytail: the table holds one question + one reply per row and has no
// parent_id, so a "conversation" is a convention: the Student's own rows that
// share an anchor (publication_id, else subject_id) and a normalised title.
// Ceiling: two unrelated questions with the same title and anchor merge into
// one conversation, and the teacher's inbox shows each follow-up as its own
// question. Upgrade path: a parent_id (thread_id) column on student_messages,
// then group by it and drop the title match.

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
}

export function normaliseTitle(subject: string): string {
  return subject.trim().replace(/\s+/g, ' ').toLowerCase()
}

const anchorOf = (r: ThreadRow) => (r.publication_id ? `p:${r.publication_id}` : `s:${r.subject_id ?? ''}`)
export const threadKey = (r: ThreadRow) => `${anchorOf(r)}|${normaliseTitle(r.subject)}`

/** Group a Student's rows into conversations. Newest activity first. */
export function buildConversations<R extends ThreadRow>(rows: R[]): Conversation<R>[] {
  const groups = new Map<string, R[]>()
  for (const r of rows) {
    const k = threadKey(r)
    const g = groups.get(k)
    if (g) g.push(r)
    else groups.set(k, [r])
  }
  const out = [...groups.values()].map((g) => {
    const sorted = [...g].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const steps: ThreadStep[] = []
    let lastActivity = first.created_at
    for (const r of sorted) {
      steps.push({ kind: 'asked', at: r.created_at, body: r.body, rowId: r.id })
      if (r.created_at > lastActivity) lastActivity = r.created_at
      if (r.reply_body) {
        steps.push({ kind: 'replied', at: r.replied_at, body: r.reply_body, rowId: r.id })
        if (r.replied_at && r.replied_at > lastActivity) lastActivity = r.replied_at
      }
    }
    const answered = isAnswered(last)
    if (!answered) steps.push({ kind: 'waiting', at: last.created_at, rowId: last.id })
    return { id: first.id, rows: sorted, first, last, title: first.subject, answered, lastActivity, steps }
  })
  return out.sort((a, b) => b.lastActivity.localeCompare(a.lastActivity))
}

/** The conversation any of whose rows has this id (so an old ?q=<followup id> still opens). */
export function findConversation<R extends ThreadRow>(list: Conversation<R>[], rowId: string): Conversation<R> | null {
  return list.find((c) => c.rows.some((r) => r.id === rowId)) ?? null
}
