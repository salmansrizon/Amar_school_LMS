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
