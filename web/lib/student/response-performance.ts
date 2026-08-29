// How well a school answers its students (#455).
//
// The ticket's binding constraint is its last line: these are humans being
// measured, so this produces counts that support a conversation — what is
// waiting, and for how long — and deliberately does NOT rank people. There is
// no score, no ordering by performance, and no "worst" teacher: rows come back
// in a stable alphabetical order, and the thing highlighted is the oldest
// unanswered question, which is an action, not a verdict.
//
// Who a question is accounted to (#511, ADR 0019):
//
//   answered   -> whoever replied
//   unanswered -> the Class Teacher of the asking Student's Class
//
// The split is the whole point. Accounting everything to the Class Teacher —
// what this did until #511 — credited her with a colleague's work and blamed
// her for his silence, which is the blame ADR 0018 claims to have removed while
// leaving this file untouched. Accounting everything to the replier would have
// left an unanswered question accounted to nobody, and "who should have answered
// this" is the question the Owner is actually asking.
//
// A question therefore MOVES between rows the moment somebody answers it, and a
// Class Teacher's total can fall between two readings of the same window. That
// is deliberate: a row means "what is on me as things now stand".

import { isAnswered, type MessageStatus } from '@/lib/student/messages'

export interface MessageForStats {
  id: string
  created_at: string
  replied_at: string | null
  /** Needed because `replied_at` alone is not the answer to "was this
   *  answered?" — see isAnswered. A row can be answered with no recorded
   *  time. */
  status: MessageStatus
  /** The Class Teacher accountable for the asking student's class. Null when
   *  the class has no teacher assigned, or the teacher has no login — both
   *  normal states (#435), collected under "unassigned". */
  teacherId: string | null
  teacherName: string | null
  /** Who actually replied, as an `employees.id` — or OWNER_BUCKET where the
   *  School Owner replied, since she has no Employee record to point at.
   *
   *  Null on an unanswered question, and null on a question answered before
   *  #511 shipped: `replied_by` has only been written since #454, and rows
   *  answered through a bare PATCH carry no replier at all. Those fall back to
   *  the Class Teacher, which is exactly the old behaviour for old rows. */
  repliedById: string | null
  repliedByName: string | null
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

/**
 * The School Owner's row.
 *
 * She replies, and she has no `employees` row to key on — every other actor in
 * this table does. A literal rather than null because null already means
 * "unassigned": a Class with no Class Teacher, nobody accountable. Collapsing
 * "nobody was accountable" into "the Owner answered it herself" would make the
 * one number she is looking at wrong in her own favour.
 *
 * Safe as a sentinel because every real key here is a uuid.
 */
export const OWNER_BUCKET = 'owner'

/** Whose row this question lands in. The rule, in one place. */
function accountedTo(m: MessageForStats): { id: string | null; name: string | null } {
  if (isAnswered(m) && m.repliedById) return { id: m.repliedById, name: m.repliedByName }
  return { id: m.teacherId, name: m.teacherName }
}

function statsFor(
  teacherId: string | null,
  teacherName: string | null,
  messages: MessageForStats[],
  now: number,
): ResponseStats {
  // Counting and timing are two different questions, and `replied_at` only
  // answers the second. A reply with no recorded time is still a reply.
  const answered = messages.filter(isAnswered)
  const waiting = messages.filter((m) => !isAnswered(m))

  // Timed over replies whose duration is actually known. Fabricating one from
  // created_at would flatter the median; from now() would wreck it.
  const replyHours = answered
    .filter((m) => m.replied_at)
    .map((m) => hoursBetween(m.created_at, m.replied_at!))
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
  const byPerson = new Map<string, { name: string | null; rows: MessageForStats[] }>()

  for (const message of messages) {
    const { id, name } = accountedTo(message)
    const key = id ?? ''
    const bucket = byPerson.get(key)
    // First non-null name wins: the same person can arrive as a replier on one
    // row and as a Class Teacher on the next, and only one of those carries a
    // name if an employee lookup missed.
    if (bucket) bucket.rows.push(message)
    else byPerson.set(key, { name, rows: [message] })
    if (bucket && bucket.name === null) bucket.name = name
  }

  const perTeacher = [...byPerson.entries()]
    .map(([key, { name, rows }]) => statsFor(key || null, name, rows, at))
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

/**
 * The school-wide Σ, from `school_question_timings` (migration 0152).
 *
 * A teacher's own SELECT on `student_messages` stops at her classes (ADR 0018),
 * so rolling her rows up would print her own total under the school's label — a
 * wrong number is worse than no number. The RPC hands back two timestamps per
 * question and nothing else, and this turns them into the same shape the Owner's
 * figures come from, so both halves of the table are one definition of "median".
 *
 * The synthetic id and empty subject are honest: neither is disclosed by the RPC,
 * and neither is read for the Σ row — only `oldestWaiting.hours` is.
 */
export function schoolWideOverall(
  timings: { created_at: string; replied_at: string | null }[],
  now: Date = new Date(),
): ResponseStats {
  return responseReport(
    timings.map((m, i) => ({
      id: String(i),
      subject: '',
      created_at: m.created_at,
      replied_at: m.replied_at,
      // school_question_timings returns timestamps only, so the timestamp IS
      // the evidence here — there is no status column to disagree with.
      status: (m.replied_at ? 'answered' : 'unread') as MessageStatus,
      teacherId: null,
      teacherName: null,
      // No per-person split in the Σ: the RPC discloses timestamps and nothing
      // else, which is the reason a teacher may read it at all.
      repliedById: null,
      repliedByName: null,
    })),
    now,
  ).overall
}

/**
 * Which per-teacher rows the caller may see (#509).
 *
 * The Owner keeps the full table. A teacher sees her own row and no other —
 * "enough to know I'm at 14h and the school is at 9h without publishing a league
 * table to the people on it". The unassigned bucket (a class with no Class
 * Teacher) belongs to nobody, so it stays with the Owner rather than surfacing
 * on some arbitrary teacher's page, and so does OWNER_BUCKET.
 *
 * A Subject Teacher matches only through his replies (#511): the unanswered half
 * still keys on Class Teacher, so his row can never hold a waiting question and
 * his "still waiting" column is structurally always empty. Correct per ADR 0018
 * — he answers about the work he set, he is not accountable for the class.
 */
export function visibleTeacherRows(
  report: PerformanceReport,
  { isOwner, employeeId }: { isOwner: boolean; employeeId: string | null },
): ResponseStats[] {
  if (isOwner) return report.perTeacher
  return report.perTeacher.filter((stats) => stats.teacherId !== null && stats.teacherId === employeeId)
}
