// Global Academic Year Filtering (map #609, T5/#614): the browse-surface twin
// of Global Shift Filtering (`shift-filter.ts`). A read-time view filter and
// nothing else — it narrows what a browse/management list query returns to the
// caller's current effective Global Academic Year Selection (#612's
// `academicYearSelection`, already reconciled against the School's started-year
// history and guaranteed to contain `active_academic_year`). It is never an
// authorization mechanism, never RLS, never a mutation of `class_offerings`,
// and it must never be composed onto a targeting/compose query (Notice, SMS,
// Homework, broadcast `target_academic_year`) — those stay pinned to
// `active_academic_year` by business rule.
//
// Composed onto a query exactly like any other predicate (tenant scoping,
// search, Shift filtering, pagination all stay intact, AND-combined with this).
// A NULL-`academic_year` row always passes through unconditionally — the same
// "don't silently hide legacy/missing data" principle the Shift helper applies
// to NULL-shift rows — so it is composed via
// `.or('academic_year.is.null,academic_year.in.(...)')`, never a bare
// `.in('academic_year', selection)` which would drop the NULL-year rows.
//
// Only the Offerings shape exists here (unlike Shift, which also has a Students
// variant): every browse surface this map touches — the Class Offerings list,
// the Fee Structures Offering picker, the Exams Offering picker/browse — reads
// `class_offerings` directly, where `academic_year` is a column on the row.
//
// Short-circuits to a no-op when `selection` is empty (a legacy School with no
// started-year history and a NULL `active_academic_year`): there is nothing to
// filter by, so the query passes through unmodified rather than matching
// nothing.

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
