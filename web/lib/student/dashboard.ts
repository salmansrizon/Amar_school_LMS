import { localeOf, type Lang } from '@/lib/i18n'
import type { UpcomingItem } from '@/lib/dashboard'
import { addDays, schoolToday } from '@/lib/school-time'
import { missingSubjects, groupByExam, subjectFullMarks, subjectObtained, type ResultRow } from '@/lib/student/results'
import { WAITING_WARN_HOURS, waitingHours } from '@/lib/student/hub'
import { isAnswered, type MessageStatus } from '@/lib/student/messages'
import type { ExamRoutineRow } from '@/lib/student/exam-schedule'
import type { FeeRecord } from '@/lib/student/fees'
import type { StudentTask } from '@/lib/student/tasks'

// The student home's urgency arithmetic, kept pure: no I/O, no Supabase, no
// hidden clock. Every function takes "today" (the school day, YYYY-MM-DD in
// Asia/Dhaka, from schoolToday()) or "now" as an argument.
//
// lib/dashboard.ts (buildDashAlerts) is the owner's version of this and could
// not be reused: it is shaped around grants, SMS credit and approvals.
//
// Nothing here grades. A student cannot read grading_schemes or grade_bands
// (issue #702), so the result helpers return raw marks only.

// Decision D4: the thresholds, named so a school can be tuned in one place.
/** A task due today..today+N is "due soon" (amber). */
export const TASK_DUE_SOON_DAYS = 2
/** An exam paper 1..N days away is "soon" (amber); today is red. */
export const EXAM_SOON_DAYS = 3
/** Attendance at or above this percent is green. */
export const ATTENDANCE_GOOD_PERCENT = 90
/** Attendance below this percent is red; between the two is amber. */
export const ATTENDANCE_LOW_PERCENT = 75
/** A rejected leave request is reported for this many days. */
export const LEAVE_REJECTED_DAYS = 7
/** A question waiting this many hours is reported (same constant as the staff hub). */
export const QUESTION_WAITING_HOURS = WAITING_WARN_HOURS
/** The "needs you now" strip never shows more rows than this. */
export const MAX_STUDENT_ALERTS = 6

/** The tones this module hands out; a subset of the widgets' WidgetTone. */
export type DashTone = 'alert' | 'sun' | 'sky' | 'mint' | 'muted'

/** The school calendar day (YYYY-MM-DD, Asia/Dhaka) a timestamp falls on.
 *  '' for an unparseable value. */
export function schoolDay(timestamp: string | Date): string {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp)
  return Number.isNaN(date.getTime()) ? '' : schoolToday(date)
}

// ---------------------------------------------------------------- homework

type TaskState = Pick<StudentTask, 'completed_at' | 'submitted' | 'due_at'>

/** Decision D2: a task is handled when it is ticked done OR work was handed in.
 *  bucketFor() in tasks.ts only knows the tick and is left unchanged. */
export function isTaskHandled(task: Pick<StudentTask, 'completed_at' | 'submitted'>): boolean {
  return Boolean(task.completed_at) || task.submitted === true
}

export type TaskUrgency = 'done' | 'overdue' | 'dueSoon' | 'later'

/** Which pile a task is in, by school day rather than by the millisecond:
 *  due day before today is overdue, today..today+TASK_DUE_SOON_DAYS is due
 *  soon. A handled task is done; an undated task is never overdue. */
export function taskUrgency(task: TaskState, today: string): TaskUrgency {
  if (isTaskHandled(task)) return 'done'
  const due = task.due_at ? schoolDay(task.due_at) : ''
  if (!due) return 'later'
  if (due < today) return 'overdue'
  return due <= addDays(today, TASK_DUE_SOON_DAYS) ? 'dueSoon' : 'later'
}

export interface DashboardTaskCounts<T> {
  overdue: number
  dueSoon: number
  /** overdue + dueSoon: what the home calls pending. */
  pending: number
  /** The overdue task with the earliest deadline, or null. */
  oldestOverdue: T | null
  /** The due-soon task with the earliest deadline, or null. */
  nextDue: T | null
}

export function dashboardTaskCounts<T extends TaskState>(tasks: T[], today: string): DashboardTaskCounts<T> {
  const pile = (kind: TaskUrgency) =>
    tasks
      .filter((t) => taskUrgency(t, today) === kind)
      .sort((a, b) => (a.due_at ?? '').localeCompare(b.due_at ?? ''))
  const overdue = pile('overdue')
  const dueSoon = pile('dueSoon')
  return {
    overdue: overdue.length,
    dueSoon: dueSoon.length,
    pending: overdue.length + dueSoon.length,
    oldestOverdue: overdue[0] ?? null,
    nextDue: dueSoon[0] ?? null,
  }
}

// -------------------------------------------------------------------- fees

type FeeMonth = Pick<FeeRecord, 'month' | 'year' | 'due_amount'>

/** True when the month still has a due amount and lies before today's month. */
export function isFeeOverdue(record: FeeMonth, today: string): boolean {
  const current = Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7))
  return Number(record.due_amount ?? 0) > 0 && record.year * 12 + record.month < current
}

export interface FeeStatus<T> {
  /** Sum of due_amount over every month. */
  due: number
  /** How many months still have a due amount. */
  monthsDue: number
  /** The earliest month with a due amount, or null. */
  oldest: T | null
  /** alert: a past month is unpaid. sun: only this month (or a later one) is
   *  due. mint: nothing due. muted: there are no fee rows at all. */
  tone: DashTone
}

export function feeStatus<T extends FeeMonth>(records: T[], today: string): FeeStatus<T> {
  const owing = records
    .filter((r) => Number(r.due_amount ?? 0) > 0)
    .sort((a, b) => a.year - b.year || a.month - b.month)
  return {
    due: owing.reduce((sum, r) => sum + Number(r.due_amount), 0),
    monthsDue: owing.length,
    oldest: owing[0] ?? null,
    tone: !records.length ? 'muted' : !owing.length ? 'mint' : owing.some((r) => isFeeOverdue(r, today)) ? 'alert' : 'sun',
  }
}

// ------------------------------------------------------------------- exams

export type ExamUrgency = 'past' | 'today' | 'soon' | 'later'

/** today is red, 1..EXAM_SOON_DAYS days away is amber. */
export function examUrgency(examDate: string, today: string): ExamUrgency {
  if (examDate < today) return 'past'
  if (examDate === today) return 'today'
  return examDate <= addDays(today, EXAM_SOON_DAYS) ? 'soon' : 'later'
}

/** "১০:৩০ AM" / "10:30 AM" from a Postgres time ('HH:MM' or 'HH:MM:SS'), in
 *  the same style as formatTime (which needs a full Date). '' for null or an
 *  unparseable value. */
export function formatClock(time: string | null | undefined, lang: Lang): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(time ?? '')
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return ''
  return new Intl.DateTimeFormat(localeOf(lang), { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' })
    .format(new Date(Date.UTC(2000, 0, 1, Number(m[1]), Number(m[2]))))
    .replace(/\b(am|pm)\b/, (s) => s.toUpperCase())
}

// -------------------------------------------------------------- attendance

/** The owner's bands: >= 90 mint, 75..89 sun, < 75 alert; null (nothing
 *  recorded yet) is muted. */
export function attendanceBand(percent: number | null): DashTone {
  if (percent === null) return 'muted'
  if (percent >= ATTENDANCE_GOOD_PERCENT) return 'mint'
  return percent >= ATTENDANCE_LOW_PERCENT ? 'sun' : 'alert'
}

// ----------------------------------------------------------------- results

/** Raw marks over a set of result rows. No grade, GPA or pass/fail (#702). */
export function rawTotal(rows: ResultRow[]): { obtained: number; full: number } {
  return rows.reduce(
    (sum, r) => ({ obtained: sum.obtained + subjectObtained(r), full: sum.full + subjectFullMarks(r) }),
    { obtained: 0, full: 0 },
  )
}

export type LatestResult =
  | { state: 'none' }
  | {
      /** incomplete: a subject of the student's class has no mark, so the total
       *  and the rank must not be shown (same rule as the result page). */
      state: 'ok' | 'incomplete'
      examId: string
      examName: string
      examYear: number
      obtained: number
      full: number
      subjects: number
    }

/** The most recently published exam (by results_published_at) with its raw
 *  total. `classSubjects` are the rows of student_subject_option. */
export function latestResult(rows: ResultRow[], classSubjects: { id: string }[] = []): LatestResult {
  if (!rows.length) return { state: 'none' }
  const newest = rows.reduce((a, b) => ((b.results_published_at ?? '') > (a.results_published_at ?? '') ? b : a))
  const exam = groupByExam(rows).find((e) => e.examId === newest.exam_id)!
  return {
    state: missingSubjects(exam, classSubjects).length ? 'incomplete' : 'ok',
    examId: exam.examId,
    examName: exam.examName,
    examYear: exam.examYear,
    subjects: exam.rows.length,
    ...rawTotal(exam.rows),
  }
}

// ------------------------------------------------------------------ alerts

export interface AlertNotice {
  id: string
  title: string
  importance: string
  created_at: string
}
export interface AlertLeave {
  from_day: string
  to_day: string
  status: string
  created_at: string
}
export interface AlertMessage {
  subject: string
  status: MessageStatus
  replied_at: string | null
  created_at: string
}

export interface StudentAlertInput {
  /** School day, YYYY-MM-DD. */
  today: string
  /** The instant, for the question's waiting hours. */
  now: Date
  tasks: StudentTask[]
  fees: FeeRecord[]
  exams: ExamRoutineRow[]
  notices: AlertNotice[]
  /** Ids of notices this student has not opened. */
  unread: ReadonlySet<string>
  leaves: AlertLeave[]
  messages: AlertMessage[]
  /** This month's percent; null when no attendance has been recorded. */
  attendancePercent: number | null
}

interface AlertBase {
  tone: 'alert' | 'sun' | 'sky'
  href: string
  /** Sort key inside a tone: a school day, earliest first; null sorts last. */
  date: string | null
}

/** Language-free: the page turns `kind` + payload into words. At most one
 *  alert per kind, so `kind` is a stable key. */
export type StudentAlert = AlertBase &
  (
    | { kind: 'tasksOverdue' | 'tasksDue'; count: number; task: StudentTask }
    | { kind: 'feeOverdue' | 'feeDue'; amount: number; month: number; year: number }
    | { kind: 'examToday' | 'examSoon'; paper: ExamRoutineRow }
    | { kind: 'urgentNotice'; count: number; notice: AlertNotice }
    | { kind: 'leaveRejected' | 'leavePending'; count: number; leave: AlertLeave }
    | { kind: 'attendanceLow'; percent: number }
    | { kind: 'questionWaiting'; count: number; message: AlertMessage }
    | { kind: 'newNotices'; count: number }
  )

const TONE_RANK = { alert: 0, sun: 1, sky: 2 } as const

/**
 * Everything waiting on the student, most urgent first: alert rows, then sun,
 * then sky; inside a tone the earliest date first, and on a tie the order
 * below. Capped at MAX_STUDENT_ALERTS.
 *
 *   alert  overdue tasks · a past month's fee · exam today · unread urgent notice
 *   sun    tasks due within 2 days · this month's fee · exam in 1-3 days ·
 *          leave rejected in the last 7 days · attendance under 75%
 *   sky    leave pending · question waiting over 24 h · unread notices
 */
export function buildStudentAlerts(input: StudentAlertInput): StudentAlert[] {
  const { today, now } = input
  const out: StudentAlert[] = []

  const tasks = dashboardTaskCounts(input.tasks, today)
  if (tasks.oldestOverdue)
    out.push({
      kind: 'tasksOverdue',
      tone: 'alert',
      href: '/student/tasks',
      date: schoolDay(tasks.oldestOverdue.due_at!),
      count: tasks.overdue,
      task: tasks.oldestOverdue,
    })
  if (tasks.nextDue)
    out.push({
      kind: 'tasksDue',
      tone: 'sun',
      href: '/student/tasks',
      date: schoolDay(tasks.nextDue.due_at!),
      count: tasks.dueSoon,
      task: tasks.nextDue,
    })

  const fee = feeStatus(input.fees, today)
  if (fee.oldest) {
    const overdue = fee.tone === 'alert'
    out.push({
      kind: overdue ? 'feeOverdue' : 'feeDue',
      tone: overdue ? 'alert' : 'sun',
      href: '/student/fees',
      date: `${fee.oldest.year}-${String(fee.oldest.month).padStart(2, '0')}-01`,
      amount: fee.due,
      month: fee.oldest.month,
      year: fee.oldest.year,
    })
  }

  // The next paper only: one exam row, not one per subject of the week.
  const paper = [...input.exams]
    .filter((p) => p.exam_date >= today)
    .sort((a, b) => a.exam_date.localeCompare(b.exam_date) || (a.start_time ?? '').localeCompare(b.start_time ?? ''))[0]
  const when = paper ? examUrgency(paper.exam_date, today) : 'later'
  if (paper && when !== 'later')
    out.push({
      kind: when === 'today' ? 'examToday' : 'examSoon',
      tone: when === 'today' ? 'alert' : 'sun',
      href: '/student/exams',
      date: paper.exam_date,
      paper,
    })

  const unread = input.notices.filter((n) => input.unread.has(n.id))
  const urgent = unread
    .filter((n) => n.importance === 'urgent')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  if (urgent.length)
    out.push({
      kind: 'urgentNotice',
      tone: 'alert',
      href: `/student/notices/${urgent[0].id}`,
      date: schoolDay(urgent[0].created_at),
      count: urgent.length,
      notice: urgent[0],
    })
  if (unread.length > urgent.length)
    out.push({
      kind: 'newNotices',
      tone: 'sky',
      href: '/student/notices',
      date: null,
      count: unread.length - urgent.length,
    })

  // ponytail: student_leaves has no decided-at column, so the 7-day window runs
  // from the request's created_at. A decision timestamp needs a migration.
  const since = addDays(today, -LEAVE_REJECTED_DAYS)
  const byStart = (a: AlertLeave, b: AlertLeave) => a.from_day.localeCompare(b.from_day)
  const rejected = input.leaves
    .filter((l) => l.status === 'rejected' && schoolDay(l.created_at) >= since)
    .sort(byStart)
  if (rejected.length)
    out.push({
      kind: 'leaveRejected',
      tone: 'sun',
      href: '/student/leave',
      date: rejected[0].from_day,
      count: rejected.length,
      leave: rejected[0],
    })
  const pending = input.leaves.filter((l) => l.status === 'pending').sort(byStart)
  if (pending.length)
    out.push({
      kind: 'leavePending',
      tone: 'sky',
      href: '/student/leave',
      date: pending[0].from_day,
      count: pending.length,
      leave: pending[0],
    })

  if (input.attendancePercent !== null && attendanceBand(input.attendancePercent) === 'alert')
    out.push({
      kind: 'attendanceLow',
      tone: 'sun',
      href: '/student/attendance',
      date: today,
      percent: input.attendancePercent,
    })

  const waiting = input.messages
    .filter((m) => !isAnswered(m) && waitingHours(m, now) >= QUESTION_WAITING_HOURS)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  if (waiting.length)
    out.push({
      kind: 'questionWaiting',
      tone: 'sky',
      href: '/student/questions',
      date: schoolDay(waiting[0].created_at),
      count: waiting.length,
      message: waiting[0],
    })

  const ORDER: StudentAlert['kind'][] = [
    'tasksOverdue', 'feeOverdue', 'examToday', 'urgentNotice',
    'tasksDue', 'feeDue', 'examSoon', 'leaveRejected', 'attendanceLow',
    'leavePending', 'questionWaiting', 'newNotices',
  ]
  return out
    .sort(
      (a, b) =>
        TONE_RANK[a.tone] - TONE_RANK[b.tone] ||
        (a.date ?? '9999').localeCompare(b.date ?? '9999') ||
        ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind),
    )
    .slice(0, MAX_STUDENT_ALERTS)
}

// ---------------------------------------------------------------- upcoming

export interface StudentUpcomingSources {
  exams: ExamRoutineRow[]
  offDays: { day: string; label: string | null }[]
  tasks: StudentTask[]
}

/**
 * The "upcoming" list: exam papers, holidays and homework deadlines dated
 * today or later, soonest first. Decision D3: a homework deadline reuses the
 * `class` kind with `dueDetail` ("জমার তারিখ") as its detail line, because
 * UpcomingKind has no task kind. Handled tasks are left out.
 */
export function buildStudentUpcoming(
  sources: StudentUpcomingSources,
  today: string,
  opts: { lang: Lang; holidayTitle: string; dueDetail: string; limit?: number },
): UpcomingItem[] {
  const items: UpcomingItem[] = [
    ...sources.exams
      .filter((p) => p.exam_date >= today)
      .map((p) => ({
        kind: 'exam' as const,
        title: p.subject_name ?? p.exam_name,
        date: p.exam_date,
        detail: [p.subject_name ? p.exam_name : null, formatClock(p.start_time, opts.lang), p.room_name]
          .filter(Boolean)
          .join(' · '),
        href: '/student/exams',
      })),
    ...sources.offDays
      .filter((o) => o.day >= today)
      .map((o) => ({ kind: 'holiday' as const, title: o.label || opts.holidayTitle, date: o.day })),
    ...sources.tasks
      .filter((t) => !isTaskHandled(t) && t.due_at && schoolDay(t.due_at) >= today)
      .map((t) => ({
        kind: 'class' as const,
        title: t.title,
        date: schoolDay(t.due_at!),
        detail: opts.dueDetail,
        href: `/student/tasks/${t.id}`,
      })),
  ]
  return items.sort((a, b) => a.date.localeCompare(b.date)).slice(0, opts.limit ?? 6)
}
