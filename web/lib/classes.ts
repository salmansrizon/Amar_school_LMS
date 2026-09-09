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

// Class Offerings list filtering + Academic Year presentation (issue #597).
// #593 let two Offerings share a name+section differing by Academic Year, and
// #594 added the write path (Start Academic Year) that makes multi-year
// coexistence real — so the list needs to show and filter by year. Pure so
// the page stays a thin render over this.

/** A Class Offering row, as far as list filtering / year display need it. */
export interface ClassListRow {
  name: string
  education_level: string | null
  academic_year: number | null
}

/** Distinct Academic Years present among a School's Offerings, newest first —
 *  the real options for the year filter dropdown (never an invented year;
 *  #597 Q5). Nulls (legacy rows with no recorded year) are not an option. */
export function academicYearsOf(classes: readonly ClassListRow[]): number[] {
  return [...new Set(classes.map((c) => c.academic_year).filter((y): y is number => y != null))].sort(
    (a, b) => b - a,
  )
}

/** Show the Academic Year column only when the (unfiltered) Offering set spans
 *  more than one distinct year — mirrors the conditional Shift column's
 *  intent: no column for a value that is the same on every row (#597 Q3).
 *  Nulls (legacy rows with no recorded year) do not count as a distinct
 *  year, so a single real year plus legacy nulls keeps the pre-#597 view.
 *  Computed from the full set, so it stays visible while the table is
 *  filtered to one year. */
export function showAcademicYearColumn(classes: readonly ClassListRow[]): boolean {
  return academicYearsOf(classes).length > 1
}

/** The effective year the list is filtered to: `null` means "All years".
 *   - `raw === 'all'` -> null (show every year)
 *   - a specific year that a School actually has Offerings in -> that year
 *   - anything else (absent, garbage, a year with no Offerings) -> the active
 *     Academic Year when the School has Offerings in it, otherwise null
 *  (#597 Q2 default-to-active-year, Q5 validate-against-present). */
export function resolveYearFilter(
  raw: string | undefined,
  { activeYear, presentYears }: { activeYear: number | null; presentYears: readonly number[] },
): number | null {
  if (raw === 'all') return null
  const asked = raw ? Number(raw) : NaN
  if (Number.isFinite(asked) && presentYears.includes(asked)) return asked
  return activeYear != null && presentYears.includes(activeYear) ? activeYear : null
}

/** The Class Offerings the list renders: name search + Education Level +
 *  Academic Year, all AND-combined, all in memory (the page keeps the full
 *  set for the Subjects picker / level options / counts). `year: null` =
 *  every year. Preserves the pre-#597 `q`/`level` semantics exactly. */
export function visibleClasses<T extends ClassListRow>(
  classes: readonly T[],
  { q, level, year }: { q: string; level: string; year: number | null },
): T[] {
  const query = q.trim().toLowerCase()
  return classes.filter(
    (c) =>
      (!query || c.name.toLowerCase().includes(query)) &&
      (!level || c.education_level === level) &&
      (year == null || c.academic_year === year),
  )
}

export type HomeworkTargetRow = PublicationTargetRow

/** Whether a homework Publication targets this Class Offering — `my-classes`
 *  page's own filter (map #568/#582, Wave 4a Part B; offering-aware since
 *  map #598 Wave 4/#605). A thin wrapper over the shared resolution
 *  primitive (`targetRowMatchesOffering`, `lib/publishing.ts`) rather than
 *  its own copy of the match -- the third independent re-implementation of
 *  this exact rule this map exists to close (`student_matches_target` and
 *  `task_completion_roster` were the other two, Waves 2-3/#603-#604).
 *  `target_scope='all'` always matches (school-wide); a null predicate field
 *  means "any" for that half of the target -- the same null-guard every
 *  other consumer applies (issue #572's resolution). Also fixes a real gap
 *  found during Wave 4a's planning pass (#587's own comment): the original
 *  inline predicate this replaced never checked scope at all, so a
 *  school-wide homework never showed on any Class Teacher's list. */
export function homeworkTargetsOffering(task: HomeworkTargetRow, offering: OfferingRow): boolean {
  return targetRowMatchesOffering(task, offering)
}
