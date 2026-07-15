// Pure helpers for the School Owner dashboard home (issue #72).
// Data fetching lives in the page; everything here is deterministic + unit-tested.

export type ActivityType = 'admission' | 'notice' | 'feedback'

export interface ActivityItem {
  type: ActivityType
  /** Primary text (student/notice/feedback title). */
  title: string
  /** ISO timestamp used for ordering + display. */
  at: string
  /** Source record id, when available. */
  id?: string
  /** Where clicking the activity navigates, when the record is addressable. */
  href?: string
}

export interface ActivitySources {
  students: { id?: string; full_name: string; created_at: string }[]
  notices: { id?: string; title: string; created_at: string }[]
  feedback: { id?: string; subject: string; created_at: string }[]
}

/** Where an activity of a given type/id opens. Feedback has no per-item route
 *  yet, so it deep-links to the inbox. */
export function activityHref(type: ActivityType, id?: string): string | undefined {
  if (!id) return undefined
  switch (type) {
    case 'admission':
      return `/school/students/${id}`
    case 'notice':
      return `/school/notices/${id}`
    case 'feedback':
      return `/school/feedback`
  }
}

/** Percentage of `present` over `total`, 0 when there is no roster, rounded to 1 dp. */
export function attendanceRate(present: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((present / total) * 1000) / 10
}

/** Merge the three activity streams into one list, newest first, capped at `limit`. */
export function mergeActivity(sources: ActivitySources, limit = 6): ActivityItem[] {
  const items: ActivityItem[] = [
    ...sources.students.map((s) => ({
      type: 'admission' as const,
      title: s.full_name,
      at: s.created_at,
      id: s.id,
      href: activityHref('admission', s.id),
    })),
    ...sources.notices.map((n) => ({
      type: 'notice' as const,
      title: n.title,
      at: n.created_at,
      id: n.id,
      href: activityHref('notice', n.id),
    })),
    ...sources.feedback.map((f) => ({
      type: 'feedback' as const,
      title: f.subject,
      at: f.created_at,
      id: f.id,
      href: activityHref('feedback', f.id),
    })),
  ]
  return items
    .filter((i) => i.at)
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, limit)
}

export type UpcomingKind = 'exam' | 'holiday' | 'class'

export interface UpcomingItem {
  kind: UpcomingKind
  title: string
  /** ISO date (YYYY-MM-DD) used for ordering + display. */
  date: string
  /** Secondary line (e.g. class name, period). */
  detail?: string
  href?: string
}

export interface UpcomingSources {
  /** Exams with a scheduled start date. */
  exams: { id?: string; name: string; start_date: string | null }[]
  /** Off-days / holidays / significant days. */
  holidays: { day: string; title: string }[]
  /** Today's class-routine entries (already resolved to names). */
  classesToday: { title: string; detail?: string }[]
}

/** Merge the scheduled streams into one upcoming list (soonest first), keeping
 *  only items dated today or later. `today` is an ISO date (YYYY-MM-DD). */
export function buildUpcoming(sources: UpcomingSources, today: string, limit = 8): UpcomingItem[] {
  const items: UpcomingItem[] = [
    ...sources.classesToday.map((c) => ({
      kind: 'class' as const,
      title: c.title,
      date: today,
      detail: c.detail,
      href: '/school/attendance/mark',
    })),
    ...sources.exams
      .filter((e) => e.start_date && e.start_date >= today)
      .map((e) => ({
        kind: 'exam' as const,
        title: e.name,
        date: e.start_date as string,
        href: e.id ? `/school/exams/${e.id}` : undefined,
      })),
    ...sources.holidays
      .filter((h) => h.day >= today)
      .map((h) => ({ kind: 'holiday' as const, title: h.title, date: h.day })),
  ]
  return items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).slice(0, limit)
}

/** True when a subscription is still valid (no expiry set counts as active). */
export function isSubscriptionActive(expiresAt: string | null, today: Date): boolean {
  if (!expiresAt) return true
  const exp = new Date(expiresAt + 'T00:00:00Z')
  return exp.getTime() >= Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
}
