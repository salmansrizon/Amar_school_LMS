// Global Shift Filtering (issue #579, Wave 5/#590): a read-time view filter,
// nothing else. Not an authorization mechanism, not a data-integrity
// mechanism — purely narrows what a list/report query returns to the
// caller's current effective Global Shift Selection (#577's
// parseShiftSelection output). Composed onto a query exactly like any other
// predicate (tenant scoping, search, status, pagination all stay intact,
// AND-combined with this, never replaced by it) — never post-fetch/in-memory
// filtering, never RLS, never a mutation of class_offerings/students.
//
// A NULL-shift row always passes through, unconditionally — it is not a
// hidden "Unclassified" bucket, it's the same "don't silently hide
// legacy/missing data" principle this map has applied everywhere else
// (Students without a current Enrollment, legacy employees.category
// values). Composed via `.or('shift.is.null,shift.in.(...)')`, never a bare
// `.in('shift', selection)`, which would incorrectly hide NULL-shift rows.
//
// Two structurally different helpers, not one function trying to abstract
// two different query shapes:
// - applyGlobalShiftFilterToOfferings: queries whose source is
//   class_offerings directly (pickers, Offering lists) — `shift` is a
//   column on the row itself. Sync, a single `.or()` composed onto the
//   query, exactly as simple as it looks.
// - applyGlobalShiftFilterToStudents: queries whose source is students,
//   reached through current_enrollment_id -> student_enrollments ->
//   class_offerings.shift, NOT the legacy class_name/section text bridge.
//   This one is NOT a single `.or()` composition, and deliberately so —
//   discovered empirically, not assumed: PostgREST's embedded-resource
//   `.or(filters, { referencedTable })` only *nulls out* the embedded
//   object on a non-matching row, it does not exclude the parent row at
//   all, unless the embed is marked `!inner` — and `!inner` turns it into
//   an inner join, which then also drops every student with no current
//   Enrollment at all (current_enrollment_id null), exactly the rows this
//   filter must never hide. Neither a left nor an inner embed gets both
//   "shift-mismatched enrolled students excluded" and "unenrolled students
//   always included" in one query. The two-step resolution below sidesteps
//   this entirely: resolve which Enrollments match first (through the
//   already-working Offerings helper), then filter students by the plain
//   top-level `current_enrollment_id` column — no embedded-resource filter,
//   no PostgREST join-type tradeoff.
//   As of Wave 5, no screen actually calls this yet: every currently-safe
//   enrollment-joined query (Promotion, Subject Assignment, the classes/
//   my-classes headcounts) resolves the roster of one already-selected
//   class_offering_id — filtering there means filtering the *Offering
//   picker* (Shape 1), not narrowing an unbounded Student list. The
//   screens that DO list students broadly (the main Students list,
//   Attendance, most of Exams) still resolve via the legacy text bridge,
//   which cannot reach `shift` at all without first switching to an
//   enrollment join — the same premature-cutover trap Wave 4a/4c avoided
//   elsewhere, genuinely Wave 6's territory. This helper exists, is built
//   and tested, ready for whichever wave first has a real Shape-2 call site.
//
// Both short-circuit to a no-op when `selection` is empty (a No-Shift
// institute, or every configured Shift currently deselected) — there is
// nothing to filter by, so the query passes through unmodified rather than
// (incorrectly) matching nothing.

import type { SupabaseClient } from '@supabase/supabase-js'

/** A uuid that can never match a real row — the `.in()` escape hatch for
 *  "the matching set is empty," since `.in('col', [])` is itself invalid
 *  PostgREST syntax (Supabase-js sends an empty list literal that the
 *  server rejects) rather than "match nothing," which is what an empty
 *  result set here actually means. */
const NO_MATCH_SENTINEL = '00000000-0000-0000-0000-000000000000'

interface OrFilterable<Self> {
  or(filters: string): Self
}

export function applyGlobalShiftFilterToOfferings<Q extends OrFilterable<Q>>(
  query: Q,
  selection: readonly string[],
): Q {
  if (selection.length === 0) return query
  return query.or(`shift.is.null,shift.in.(${selection.join(',')})`)
}

export async function applyGlobalShiftFilterToStudents<Q extends OrFilterable<Q>>(
  supabase: SupabaseClient,
  query: Q,
  selection: readonly string[],
): Promise<Q> {
  if (selection.length === 0) return query

  // Step 1: which Class Offerings match, reusing the already-correct
  // Offerings helper (NULL-shift Offerings included, same as always).
  const { data: offerings } = await applyGlobalShiftFilterToOfferings(
    supabase.from('class_offerings').select('id'),
    selection,
  )
  const offeringIds = (offerings ?? []).map((o) => o.id)

  // Step 2: which currently-open Enrollments point at one of those
  // Offerings — closed_at is excluded because current_enrollment_id can
  // only ever point at a Student's *current* (open) Enrollment by
  // construction (#573), so an enrollment this doesn't match is either
  // irrelevant history or a data bug either way, not something to surface
  // by matching it here.
  const { data: enrollments } = await supabase
    .from('student_enrollments')
    .select('id')
    .in('class_offering_id', offeringIds.length ? offeringIds : [NO_MATCH_SENTINEL])
    .is('closed_at', null)
  const enrollmentIds = (enrollments ?? []).map((e) => e.id)

  // Step 3: a plain top-level filter on students.current_enrollment_id —
  // no embedded resource involved, so no join-type tradeoff. NULL passes
  // through (no current Enrollment at all — #569's "not an error" state),
  // and a match against the resolved Enrollment id set is exact.
  return query.or(
    `current_enrollment_id.is.null,current_enrollment_id.in.(${enrollmentIds.length ? enrollmentIds.join(',') : NO_MATCH_SENTINEL})`,
  )
}
