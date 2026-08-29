// Questions to the Class Teacher (#454), kept pure.
//
// One question, one reply — not a thread. The grouping below IS the feature:
// a teacher opening their inbox should see questions gathered under the post
// they were asked about, not a flat chronological list they have to sort in
// their head.

export type MessageStatus = 'unread' | 'read' | 'answered'

/** The two columns that between them say whether a Question has been answered. */
export interface AnswerableRecord {
  status: MessageStatus
  replied_at: string | null
}

/**
 * Has this Question been answered? The single definition.
 *
 * "Answered" is one domain fact stored in two columns, and it used to be spelled
 * two different ways: `status !== 'answered'` in the inbox and the status rails,
 * `!replied_at` in the response report. Nothing made them agree, and every row
 * in the live database disagreed — so উত্তরের অবস্থা reported "0 answered,
 * 4 waiting" about four questions the inbox was showing as answered.
 *
 * Either column is sufficient evidence. `status` is what a reply sets and what a
 * Student's own screens read; `replied_at` is what the timing half needs and is
 * the one a direct PATCH can omit. Migration 0153 stops NEW rows drifting — a
 * trigger stamps the timestamp, and a CHECK refuses a timestamp without the
 * status — but rows written before it exist, and this is what reads them
 * correctly.
 *
 * Note what this deliberately does NOT do: infer a reply *time* from `status`.
 * Counting an undated reply as answered is honest; timing it is not, so
 * `responseReport` keeps those rows out of the median rather than fabricating a
 * duration from `created_at` (flattering) or `now()` (damning).
 */
export function isAnswered(record: AnswerableRecord): boolean {
  return record.status === 'answered' || record.replied_at !== null
}

export interface StudentMessage {
  id: string
  student_id: string
  publication_id: string | null
  subject_id: string | null
  subject: string
  body: string
  status: MessageStatus
  reply_body: string | null
  replied_at: string | null
  created_at: string
}

export interface InboxMessage extends StudentMessage {
  student_name: string
  class_name: string | null
  section: string | null
  roll_number: number | null
  topic_label: string
  topic_key: string
  publication_kind: string | null
}

export interface TopicGroup {
  key: string
  label: string
  /** 'post' when asked from a specific publication, 'subject' when general. */
  kind: 'post' | 'subject'
  messages: InboxMessage[]
  unanswered: number
}

/**
 * Group an inbox topic-wise.
 *
 * Ordering is by need, not by time: the topic with the most unanswered
 * questions floats up, because that is the one the teacher should address next
 * — usually the task half the class is stuck on. Ties break on recency.
 */
export function groupByTopic(messages: InboxMessage[]): TopicGroup[] {
  const groups = new Map<string, TopicGroup>()

  for (const message of messages) {
    const existing = groups.get(message.topic_key)
    if (existing) existing.messages.push(message)
    else
      groups.set(message.topic_key, {
        key: message.topic_key,
        label: message.topic_label,
        kind: message.publication_id ? 'post' : 'subject',
        messages: [message],
        unanswered: 0,
      })
  }

  for (const group of groups.values()) {
    group.messages.sort((a, b) => b.created_at.localeCompare(a.created_at))
    group.unanswered = group.messages.filter((m) => !isAnswered(m)).length
  }

  return [...groups.values()].sort(
    (a, b) =>
      b.unanswered - a.unanswered ||
      (b.messages[0]?.created_at ?? '').localeCompare(a.messages[0]?.created_at ?? ''),
  )
}

/** A question needs an anchor: the post it was asked from, or a subject. The
 *  DB enforces this too (student_message_has_anchor) — this is the early,
 *  legible refusal. */
export function validateQuestion(input: {
  subject: string
  body: string
  publicationId?: string | null
  subjectId?: string | null
}): string | null {
  if (!input.subject.trim()) return 'subjectRequired'
  if (!input.body.trim()) return 'bodyRequired'
  if (!input.publicationId && !input.subjectId) return 'anchorRequired'
  return null
}

/** How many of a student's own questions have an unread reply, for the bell. */
export function answeredCount(messages: StudentMessage[]): number {
  return messages.filter(isAnswered).length
}
