// The Student's task list (#446), kept pure.
//
// Tasks are publications of kind='homework' — the same read model as notices,
// presented as work rather than announcements. The only real logic is the split
// that makes a list of homework useful: what is overdue, what is due soon, what
// is done.

export interface StudentTask {
  id: string
  title: string
  content: string | null
  due_at: string | null
  created_at: string
  completed_at: string | null
}

export type TaskBucket = 'overdue' | 'dueSoon' | 'later' | 'done'

/** Anything due within this many days counts as "due soon". A week is the
 *  horizon a student actually plans over; a day is too tight to act on and a
 *  month collects everything. */
export const DUE_SOON_DAYS = 7

/**
 * Which pile a task belongs in.
 *
 * Done wins over overdue: a task ticked off after its deadline is finished, and
 * showing it in red forever would be nagging rather than informing. A task with
 * no due date is never overdue — `publications.due_at` is nullable and most
 * kinds ignore it.
 */
export function bucketFor(task: StudentTask, now: Date): TaskBucket {
  if (task.completed_at) return 'done'
  if (!task.due_at) return 'later'

  const due = new Date(task.due_at).getTime()
  const millis = due - now.getTime()
  if (millis < 0) return 'overdue'
  return millis <= DUE_SOON_DAYS * 24 * 60 * 60 * 1000 ? 'dueSoon' : 'later'
}

export interface TaskBuckets {
  overdue: StudentTask[]
  dueSoon: StudentTask[]
  later: StudentTask[]
  done: StudentTask[]
}

/** The list split into its four piles, each in the order a student would work
 *  through it: soonest deadline first, and undated tasks last. */
export function splitTasks(tasks: StudentTask[], now: Date): TaskBuckets {
  const out: TaskBuckets = { overdue: [], dueSoon: [], later: [], done: [] }
  for (const task of tasks) out[bucketFor(task, now)].push(task)

  const bySoonest = (a: StudentTask, b: StudentTask) => {
    if (!a.due_at && !b.due_at) return b.created_at.localeCompare(a.created_at)
    if (!a.due_at) return 1
    if (!b.due_at) return -1
    return a.due_at.localeCompare(b.due_at)
  }
  out.overdue.sort(bySoonest)
  out.dueSoon.sort(bySoonest)
  out.later.sort(bySoonest)
  // Done reads best most-recently-finished first — it is a record, not a queue.
  out.done.sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
  return out
}

/** How many tasks still need doing, for the home screen. Excludes done, and
 *  excludes undated work that is not pressing. */
export function pendingCount(buckets: TaskBuckets): number {
  return buckets.overdue.length + buckets.dueSoon.length
}
