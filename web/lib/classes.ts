// Per-Class-Offering student head counts (map #568/#582, issue #586) — a
// real join on student_enrollments.class_offering_id (closed_at is null,
// i.e. the currently-enrolled count), not the old free-text class_name/
// section matching (issue #26's MVP shape, superseded).

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

export interface HomeworkTargetRow {
  target_type: string
  target_class_name: string | null
  target_section: string | null
}

/** Whether a homework Publication targets this Class Offering — `my-classes`
 *  page's own filter (map #568/#582, Wave 4a Part B). `target_type='all'`
 *  always matches (school-wide); a null `target_class_name` or
 *  `target_section` means "any" for that half of the target — the same
 *  null-guard `student_matches_target()`/`task_completion_roster` apply
 *  (issue #572's resolution), kept in parity here so a section-only target
 *  (no class chosen, a valid create-form submission) doesn't silently
 *  disappear from My Classes while still reaching the Student portal. Also
 *  fixes a real gap found during Wave 4a's planning pass (#587's own
 *  comment): the inline predicate this replaces never checked `target_type`
 *  at all, so a `target_type='all'` homework never showed on any Class
 *  Teacher's list. */
export function homeworkTargetsOffering(
  task: HomeworkTargetRow,
  offering: { name: string; section: string | null },
): boolean {
  if (task.target_type === 'all') return true
  return (
    (!task.target_class_name || task.target_class_name === offering.name) &&
    (!task.target_section || task.target_section === (offering.section ?? ''))
  )
}
