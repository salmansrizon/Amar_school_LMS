// Per-Class-Offering student head counts (map #568/#582, issue #586) — a
// real join on student_enrollments.class_offering_id (closed_at is null,
// i.e. the currently-enrolled count), not the old free-text class_name/
// section matching (issue #26's MVP shape, superseded).

import { targetRowMatchesOffering, type OfferingRow, type PublicationTargetRow } from '@/lib/publishing'

export interface EnrollmentCountRow {
  class_offering_id: string
}

export function studentCounts(enrollments: readonly EnrollmentCountRow[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const e of enrollments) {
    counts.set(e.class_offering_id, (counts.get(e.class_offering_id) ?? 0) + 1)
  }
  return counts
}

export function countFor(counts: Map<string, number>, classOfferingId: string): number {
  return counts.get(classOfferingId) ?? 0
}

export type HomeworkTargetRow = PublicationTargetRow

/** Whether a homework Publication targets this Class Offering — `my-classes`
 *  page's own filter (map #568/#582, Wave 4a Part B; offering-aware since
 *  map #598 Wave 4/#605). A thin wrapper over the shared resolution
 *  primitive (`targetRowMatchesOffering`, `lib/publishing.ts`) rather than
 *  its own copy of the match -- the third independent re-implementation of
 *  this exact rule this map exists to close (`student_matches_target` and
 *  `task_completion_roster` were the other two, Waves 2-3/#603-#604).
 *  `target_scope='all'` (or, for a not-yet-migrated row, `target_type='all'`)
 *  always matches (school-wide); a null predicate field means "any" for
 *  that half of the target -- the same null-guard every other consumer
 *  applies (issue #572's resolution), kept in parity here so a section-only
 *  target (no class chosen, a valid create-form submission) doesn't
 *  silently disappear from My Classes while still reaching the Student
 *  portal. Also fixes a real gap found during Wave 4a's planning pass
 *  (#587's own comment): the original inline predicate this replaced never
 *  checked `target_type` at all, so a `target_type='all'` homework never
 *  showed on any Class Teacher's list. */
export function homeworkTargetsOffering(task: HomeworkTargetRow, offering: OfferingRow): boolean {
  return targetRowMatchesOffering(task, offering)
}
