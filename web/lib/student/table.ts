import { pageSizeFrom, paginate } from '@/components/pager'
import type { Params } from '@/lib/url-params'
import type { TaskUrgency } from '@/lib/student/dashboard'

// The small pure bits every Student list table shares: the search predicate,
// the page slice (same ?page= / ?size= the owner tables use) and the Tasks
// state filter. Piles themselves stay in lib/student/daily.ts.

export const STUDENT_PAGE_SIZE = 10

/** Case-insensitive "any field contains q"; an empty q matches everything. */
export function matchesQ(q: string | undefined, ...fields: (string | null | undefined)[]): boolean {
  const needle = (q ?? '').trim().toLowerCase()
  return !needle || fields.some((f) => (f ?? '').toLowerCase().includes(needle))
}

export function pageOf<T>(rows: T[], params: Params) {
  const pageSize = pageSizeFrom(params.size, STUDENT_PAGE_SIZE)
  return { ...paginate(rows, params.page, pageSize), pageSize }
}

/** Tasks `state` filter: absent = every open task, `all` = everything, else one pile. */
export function taskStateMatches(state: string | undefined, urgency: TaskUrgency): boolean {
  if (state === 'all') return true
  if (!state) return urgency !== 'done'
  return state === urgency
}
