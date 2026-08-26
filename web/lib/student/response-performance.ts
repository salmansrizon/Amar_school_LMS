// How well a school answers its students (#455).
//
// The ticket's binding constraint is its last line: these are humans being
// measured, so this produces counts that support a conversation — what is
// waiting, and for how long — and deliberately does NOT rank people. There is
// no score, no ordering by performance, and no "worst" teacher: rows come back
// in a stable alphabetical order, and the thing highlighted is the oldest
// unanswered question, which is an action, not a verdict.

export interface MessageForStats {
  id: string
  created_at: string
  replied_at: string | null
  /** The Class Teacher accountable for the asking student's class. Null when
   *  the class has no teacher assigned, or the teacher has no login — both
   *  normal states (#435), collected under "unassigned". */
  teacherId: string | null
  teacherName: string | null
  subject: string
}

export interface ResponseStats {
  teacherId: string | null
  teacherName: string | null
  received: number
  answered: number
  unanswered: number
  /** Hours from question to reply. Null when nothing has been answered yet. */
  medianHours: number | null
  slowestHours: number | null
  /** The question that has waited longest and is still waiting. */
  oldestWaiting: { id: string; subject: string; hours: number } | null
}

const HOUR = 1000 * 60 * 60

function hoursBetween(from: string, to: string | number): number {
  const end = typeof to === 'number' ? to : new Date(to).getTime()
  return Math.max(0, (end - new Date(from).getTime()) / HOUR)
}

/** Median, rounded to one decimal. Even counts average the middle pair. */
export function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const value = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  return Math.round(value * 10) / 10
}

function statsFor(
  teacherId: string | null,
  teacherName: string | null,
  messages: MessageForStats[],
  now: number,
): ResponseStats {
  const answered = messages.filter((m) => m.replied_at)
  const waiting = messages.filter((m) => !m.replied_at)

  const replyHours = answered.map((m) => hoursBetween(m.created_at, m.replied_at!))
  const oldest = waiting
    .map((m) => ({ id: m.id, subject: m.subject, hours: hoursBetween(m.created_at, now) }))
    .sort((a, b) => b.hours - a.hours)[0]

  return {
    teacherId,
    teacherName,
    received: messages.length,
    answered: answered.length,
    unanswered: waiting.length,
    medianHours: median(replyHours),
    slowestHours: replyHours.length ? Math.round(Math.max(...replyHours) * 10) / 10 : null,
    oldestWaiting: oldest
      ? { ...oldest, hours: Math.round(oldest.hours * 10) / 10 }
      : null,
  }
}

export interface PerformanceReport {
  overall: ResponseStats
  perTeacher: ResponseStats[]
}

/**
 * Per Class Teacher, plus the school rolled up.
 *
 * Ordered by name — never by any metric. Ordering people by response time is
 * the leaderboard the ticket asks this not to be, and it would change what the
 * numbers are for.
 */
export function responseReport(messages: MessageForStats[], now: Date = new Date()): PerformanceReport {
  const at = now.getTime()
  const byTeacher = new Map<string, MessageForStats[]>()

  for (const message of messages) {
    const key = message.teacherId ?? ''
    byTeacher.set(key, [...(byTeacher.get(key) ?? []), message])
  }

  const perTeacher = [...byTeacher.entries()]
    .map(([key, rows]) => statsFor(key || null, rows[0].teacherName, rows, at))
    .sort((a, b) => (a.teacherName ?? '￿').localeCompare(b.teacherName ?? '￿'))

  return { overall: statsFor(null, null, messages, at), perTeacher }
}

/** Keeps a report to a date window, inclusive of both ends. */
export function withinRange(
  messages: MessageForStats[],
  from: string | null,
  to: string | null,
): MessageForStats[] {
  return messages.filter(
    (m) =>
      (!from || m.created_at.slice(0, 10) >= from) && (!to || m.created_at.slice(0, 10) <= to),
  )
}
