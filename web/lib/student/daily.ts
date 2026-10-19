import { taskUrgency, type TaskUrgency } from '@/lib/student/dashboard'
import { isAnswered, type MessageStatus } from '@/lib/student/messages'
import type { StudentTask } from '@/lib/student/tasks'

// Pure helpers for the Student's daily pages (tasks, leave, questions,
// attendance). The urgency rules themselves live in dashboard.ts; these only
// order and group what those pages list.

/** The range the attendance page asks the absent-days RPC about. A month still
 *  running ends today (days that have not happened are not absences, the same
 *  rule as the home); a past month ends on its last day; a month that has not
 *  started has nothing to count (null). */
export function attendanceRange(
  start: string,
  end: string,
  today: string,
): { start: string; end: string } | null {
  if (today < start) return null
  return { start, end: today < end ? today : end }
}

/** The four piles, in the order the page shows them. */
export const TASK_PILES: TaskUrgency[] = ['overdue', 'dueSoon', 'later', 'done']

/** Tasks in their piles. A handed-in task is done (D2); bucketFor/splitTasks in
 *  tasks.ts are left as they were. */
export function taskPiles(tasks: StudentTask[], today: string): Record<TaskUrgency, StudentTask[]> {
  const out: Record<TaskUrgency, StudentTask[]> = { overdue: [], dueSoon: [], later: [], done: [] }
  for (const task of tasks) out[taskUrgency(task, today)].push(task)
  // Soonest deadline first, undated last; done most recently finished first.
  const soonest = (a: StudentTask, b: StudentTask) =>
    (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999') || b.created_at.localeCompare(a.created_at)
  for (const pile of ['overdue', 'dueSoon', 'later'] as const) out[pile].sort(soonest)
  out.done.sort((a, b) => (b.completed_at ?? b.created_at).localeCompare(a.completed_at ?? a.created_at))
  return out
}

/** Pending requests first, then the rest; newest request first in each. */
export function orderLeaves<T extends { status: string; created_at: string }>(leaves: T[]): T[] {
  const rank = (l: T) => (l.status === 'pending' ? 0 : 1)
  return [...leaves].sort((a, b) => rank(a) - rank(b) || b.created_at.localeCompare(a.created_at))
}

/** Questions split into waiting and answered, newest first in each. */
export function groupQuestions<T extends { status: MessageStatus; replied_at: string | null; created_at: string }>(
  questions: T[],
): { waiting: T[]; answered: T[] } {
  const newest = [...questions].sort((a, b) => b.created_at.localeCompare(a.created_at))
  return {
    waiting: newest.filter((q) => !isAnswered(q)),
    answered: newest.filter((q) => isAnswered(q)),
  }
}
