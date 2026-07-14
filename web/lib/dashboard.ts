// Pure helpers for the School Owner dashboard home (issue #72).
// Data fetching lives in the page; everything here is deterministic + unit-tested.

export type ActivityType = 'admission' | 'notice' | 'feedback'

export interface ActivityItem {
  type: ActivityType
  /** Primary text (student/notice/feedback title). */
  title: string
  /** ISO timestamp used for ordering + display. */
  at: string
}

export interface ActivitySources {
  students: { full_name: string; created_at: string }[]
  notices: { title: string; created_at: string }[]
  feedback: { subject: string; created_at: string }[]
}

/** Percentage of `present` over `total`, 0 when there is no roster, rounded to 1 dp. */
export function attendanceRate(present: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((present / total) * 1000) / 10
}

/** Merge the three activity streams into one list, newest first, capped at `limit`. */
export function mergeActivity(sources: ActivitySources, limit = 6): ActivityItem[] {
  const items: ActivityItem[] = [
    ...sources.students.map((s) => ({ type: 'admission' as const, title: s.full_name, at: s.created_at })),
    ...sources.notices.map((n) => ({ type: 'notice' as const, title: n.title, at: n.created_at })),
    ...sources.feedback.map((f) => ({ type: 'feedback' as const, title: f.subject, at: f.created_at })),
  ]
  return items
    .filter((i) => i.at)
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, limit)
}

/** True when a subscription is still valid (no expiry set counts as active). */
export function isSubscriptionActive(expiresAt: string | null, today: Date): boolean {
  if (!expiresAt) return true
  const exp = new Date(expiresAt + 'T00:00:00Z')
  return exp.getTime() >= Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
}
