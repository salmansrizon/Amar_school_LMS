import type { SupabaseClient } from '@supabase/supabase-js'
import { NO_MATCH_SENTINEL } from '@/lib/school/shift-filter'

// Resolving "who is in this class" from an exact Class Offering id (issue
// #596). Since #593 widened `class_offerings`' uniqueness so two Offerings can
// share a name+section (a Morning and a Day "Nine - A", differing only by
// Shift / Academic Year / Group Department), a `students.class_name` /
// `students.section` text match returns BOTH — mixing shifts on one exam
// roster, one fee-collection list, or one bulk-login batch. The authoritative
// identity is the `class_offering_id`, resolved through the Student's CURRENT
// Enrollment.
//
// Two-step (ids here, `students.in('id', …)` at the call site), for the same
// reason `applyGlobalShiftFilterToStudents` and `loadExamRosterResults`
// already are: PostgREST cannot exclude non-matching parent rows through an
// embedded-resource filter without an `!inner` join, and an `!inner` join
// would also drop every Student with no current Enrollment — which for these
// screens is fine (an unplaced Student is on no exam roster), but the plain
// two-step keeps the shape identical to the pattern already established.
//
// CURRENT open Enrollment only (`closed_at is null`) — deliberately the same
// membership rule `loadExamRosterResults` and every other roster screen use.
// A Student who has since transferred out, or an Offering whose Students have
// all been promoted on, will not appear. A historical / as-of-exam roster is a
// separate feature, not this correctness fix.

/**
 * Student ids whose current (open) Enrollment is in this exact Class Offering.
 * Empty array when the Offering has no current Enrollments.
 */
export async function enrolledStudentIds(
  supabase: SupabaseClient,
  classOfferingId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from('student_enrollments')
    .select('student_id')
    .eq('class_offering_id', classOfferingId)
    .is('closed_at', null)
  return (data ?? []).map((r) => r.student_id as string)
}

/**
 * The id list to hand `students.in('id', …)` — `enrolledStudentIds` with the
 * empty-set guard every call site otherwise repeats. `.in('id', [])` is
 * invalid PostgREST (it means "match nothing" but the server rejects the
 * literal), so an empty roster resolves to the never-matching sentinel.
 */
export function enrolledIdFilter(ids: string[]): string[] {
  return ids.length ? ids : [NO_MATCH_SENTINEL]
}
