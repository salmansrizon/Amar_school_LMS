// Global Academic Year Filtering (map #609, T5/#614; extended by issue #621's
// picker sweep and its own Students-roster follow-up): the browse-surface
// twin of Global Shift Filtering (`shift-filter.ts`). A read-time view filter
// on `class_offerings` reads — it narrows what a browse/management list query
// returns to the caller's current effective Global Academic Year Selection
// (#612's `academicYearSelection`, already reconciled against the School's
// started-year history and guaranteed to contain `active_academic_year`). It
// is never RLS, never a mutation of `class_offerings`, and it must never be
// composed onto a targeting/compose query (Notice, SMS, Homework, broadcast
// `target_academic_year`) — those stay pinned to `active_academic_year` by
// business rule.
//
// Composed onto a query exactly like any other predicate (tenant scoping,
// search, Shift filtering, pagination all stay intact, AND-combined with this).
// A NULL-`academic_year` row always passes through unconditionally — the same
// "don't silently hide legacy/missing data" principle the Shift helper applies
// to NULL-shift rows — so it is composed via
// `.or('academic_year.is.null,academic_year.in.(...)')`, never a bare
// `.in('academic_year', selection)` which would drop the NULL-year rows.
//
// Two shapes, same split as Shift (`applyGlobalShiftFilterToOfferings` /
// `applyGlobalShiftFilterToStudents`):
// - applyGlobalYearFilterToOfferings: `class_offerings` reads directly
//   (pickers, Offering lists) — `academic_year` is a column on the row.
// - applyGlobalYearFilterToStudents: reads a Student list narrowed by their
//   CURRENT Enrollment's Offering year — Students List, Mark Attendance,
//   Attendance Book, Student Log finder. UNLIKE its Shift counterpart, this
//   one is NOT merely a browse convenience: issue #621's follow-up sweep
//   decided explicitly that for these four screens the Global Academic Year
//   Selection is a genuine narrowing of who is reachable at all (see its own
//   doc comment below for the accepted promotion-lag consequence) — a
//   deliberate, documented exception to this module's own "browse view
//   filter, never authorization" framing above, which still holds for the
//   Offerings shape and every other caller.
//
// Short-circuits to a no-op when `selection` is empty (a legacy School with no
// started-year history and a NULL `active_academic_year`): there is nothing to
// filter by, so the query passes through unmodified rather than matching
// nothing.

import type { SupabaseClient } from '@supabase/supabase-js'

interface OrFilterable<Self> {
  or(filters: string): Self
}

export function applyGlobalYearFilterToOfferings<Q extends OrFilterable<Q>>(
  query: Q,
  selection: readonly number[],
): Q {
  if (selection.length === 0) return query
  return query.or(`academic_year.is.null,academic_year.in.(${selection.join(',')})`)
}

/** A uuid that can never match a real row — the `.in()` escape hatch for "the
 *  matching set is empty," mirroring shift-filter.ts's own NO_MATCH_SENTINEL
 *  (`.in('col', [])` is itself invalid PostgREST syntax, not "match
 *  nothing"). */
const NO_MATCH_SENTINEL = '00000000-0000-0000-0000-000000000000'

/**
 * Narrows a `students` read to the caller's Global Academic Year Selection —
 * the deliberate exception to this file's own "browse view filter only,
 * never an authorization mechanism" framing above. For Students List, Mark
 * Attendance, Attendance Book and the Student Log finder (issue #621's own
 * follow-up sweep, decided explicitly against the initially-recommended
 * "browse-only" split), the Global Academic Year Selection is a genuine
 * narrowing of who is reachable at all — not just which Offerings a picker
 * lists. A Student whose CURRENT Enrollment sits in a deselected year is
 * excluded from every one of those four screens' "All Classes" state, "All
 * Classes" now reads as "all classes in the selected years," not literally
 * every enrolled Student ever.
 *
 * Accepted, explicit consequence (not a bug): right after a School advances
 * `active_academic_year`, a Student not yet manually Promoted still has
 * their current Enrollment in the PRIOR year's Offering. If that prior year
 * is then deselected, the Student temporarily disappears from all four
 * screens — including Mark Attendance — until either that year is
 * reselected or the Student is Promoted. `active_academic_year` itself never
 * moves and Promotion is unaffected; only visibility on these four
 * screens changes.
 *
 * Mirrors applyGlobalShiftFilterToStudents's exact three-step shape (same
 * file's own documented reason a single embedded-resource `.or()` cannot do
 * this: PostgREST only nulls out a non-matching embed, `!inner` would also
 * drop every unplaced Student) — resolve matching Offerings, then matching
 * open Enrollments, then filter students by the plain top-level
 * `current_enrollment_id` column. NULL passes through unconditionally: an
 * unplaced Student (`current_enrollment_id is null`, #569's "not an error"
 * state) has no Academic Year to test against and is never hidden by this
 * filter, the same null-always-passes rule this module already applies to
 * Offerings and shift-filter.ts applies to Shift.
 */
export async function applyGlobalYearFilterToStudents<Q extends OrFilterable<Q>>(
  supabase: SupabaseClient,
  query: Q,
  selection: readonly number[],
): Promise<Q> {
  if (selection.length === 0) return query

  const { data: offerings } = await applyGlobalYearFilterToOfferings(
    supabase.from('class_offerings').select('id'),
    selection,
  )
  const offeringIds = (offerings ?? []).map((o) => o.id)

  const { data: enrollments } = await supabase
    .from('student_enrollments')
    .select('id')
    .in('class_offering_id', offeringIds.length ? offeringIds : [NO_MATCH_SENTINEL])
    .is('closed_at', null)
  const enrollmentIds = (enrollments ?? []).map((e) => e.id)

  return query.or(
    `current_enrollment_id.is.null,current_enrollment_id.in.(${enrollmentIds.length ? enrollmentIds.join(',') : NO_MATCH_SENTINEL})`,
  )
}

// The in-memory twin of the query composer above, for the one surface that
// cannot compose it: the Exams list (map #609, T6/#615) fetches `class_offerings`
// *unfiltered* because that same read is also the class-label map for existing
// exam rows (an exam in a deselected year must keep its label — the same reason
// the file is exempt from the Global Shift filter). The class-filter *dropdown*
// still narrows to the selection, so it derives its options from the loaded set
// with exactly the rule `applyGlobalYearFilterToOfferings` encodes: empty
// selection is a no-op (pass everything), a NULL `academic_year` always passes,
// otherwise the year must be in the selection.
export function filterOfferingsByYearSelection<T extends { academic_year?: number | null }>(
  offerings: readonly T[],
  selection: readonly number[],
): T[] {
  if (selection.length === 0) return [...offerings]
  return offerings.filter((o) => o.academic_year == null || selection.includes(o.academic_year))
}
