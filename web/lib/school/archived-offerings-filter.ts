// Archived Class Offering exclusion (ADR 0024) — a third "browse/pick
// narrows, resolve-existing doesn't" dimension alongside Shift and Academic
// Year (shift-filter.ts, year-filter.ts). Composed onto queries that pick a
// Class Offering for NEW forward-looking use only (Admission's Class
// dropdown, Fee Structure/Routine/Subject-assignment/Transfer/Promotion/Exam
// setup pickers, the main Class & Curriculum list) — never onto a query that
// resolves an EXISTING linkage (a Student's own current class label, My
// Classes, bulk login management, print views, a picker's own "resolve the
// already-chosen id" lookup), since a record already pointing at an archived
// Offering must keep resolving it correctly.
//
// Unlike Shift/Year, there is no NULL-passthrough subtlety here: archived_at
// is null for every non-archived row by construction, so a plain `.is()` is
// the whole filter — no `.or()` composition needed.

interface IsFilterable<Self> {
  is(column: string, value: null): Self
}

export function excludeArchivedOfferings<Q extends IsFilterable<Q>>(query: Q): Q {
  return query.is('archived_at', null)
}
