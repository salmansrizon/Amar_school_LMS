import type { Importance } from '@/lib/publishing'

// The Student's notice feed (#445), kept pure.
//
// `publications` is the model — no new table. The only decisions here are what
// order a Student reads their notices in, and what counts as new.

export interface StudentNotice {
  id: string
  kind: string
  title: string
  importance: Importance
  target_type: string
  target_class_name: string | null
  target_section: string | null
  image_path: string | null
  link_url: string | null
  created_at: string
}

/** Urgent, then important, then normal. Anything unrecognised sorts last
 *  rather than jumping the queue. */
const IMPORTANCE_RANK: Record<string, number> = { urgent: 0, important: 1, normal: 2 }

function rank(importance: string): number {
  return IMPORTANCE_RANK[importance] ?? IMPORTANCE_RANK.normal
}

/**
 * Feed order: urgency first, then newest.
 *
 * Not newest-first overall — an urgent notice posted on Monday still outranks a
 * normal one posted on Friday, which is the whole point of marking it urgent.
 * Within a level, recency wins.
 */
export function sortNotices<T extends { importance: string; created_at: string }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      rank(a.importance) - rank(b.importance) ||
      b.created_at.localeCompare(a.created_at),
  )
}

/** Whether a notice went to the whole school or to this student's class. */
export function isForMyClass(notice: { target_type: string }): boolean {
  return notice.target_type !== 'all'
}

/** The ids a Student has not opened yet, for the home screen's "what's new".
 *  Read receipts are append-only, so absence means genuinely unseen. */
export function unreadIds(
  notices: { id: string }[],
  receipts: { publication_id: string }[],
): string[] {
  const seen = new Set(receipts.map((r) => r.publication_id))
  return notices.filter((n) => !seen.has(n.id)).map((n) => n.id)
}
