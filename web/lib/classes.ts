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

/** Whether the Class Offerings list shows its Academic Year column + year
 *  filter at all. Driven by the School's *started-year history*
 *  (`startedAcademicYears`, #609/#612), not inferred from the current Offering
 *  set: a School that has started more than one year gets the column even
 *  before it has created an Offering in the new one — the spec wants history,
 *  not pure inference (#597 Q3 keeps its "no redundant column" intent, but the
 *  signal is now the started-year count). A single started year (or a legacy
 *  School with none) is byte-identical to the pre-#597 view. This is the same
 *  boolean the page threads into `classCatalogueLabel` as `showYear`. */
export function showAcademicYearColumn(startedYears: readonly number[]): boolean {
  return startedYears.length > 1
}

/** The year choices the per-page dropdown offers: the years the School
 *  actually has Offerings in, already narrowed to the current Global Academic
 *  Year Selection by the caller (so the dropdown can only ever narrow *within*
 *  the global set, never widen it), plus the active Academic Year which is
 *  always a valid choice even with no Offering in it yet. Newest first, deduped. */
export function yearFilterOptions(
  selectableYears: readonly number[],
  activeYear: number | null,
): number[] {
  const out = new Set(selectableYears)
  if (activeYear != null) out.add(activeYear)
  return [...out].sort((a, b) => b - a)
}

// "Copy Classes from {year}" — the list-header action (map #609, T8/#617) over
// the copy_class_offerings_to_active_year RPC (T7/#616). These helpers keep the
// page + control a thin render: what years the copy can pull from, which one it
// defaults to, whether the control shows at all, and how to read the result.

/** A candidate copy source year plus how many Offerings the School has in it. */
export interface CopySourceYear {
  year: number
  offeringCount: number
}

/** The years "Copy Classes from {year}" can pull from: every *started* year
 *  (`startedAcademicYears`, #612 — never inferred from the Offering set) strictly
 *  older than the active Academic Year, newest first, each carrying its Offering
 *  count taken from the set the page already holds. Empty when the School has no
 *  active year yet, or has never started an earlier one. The RPC re-validates
 *  "was never started" / "older than the active year" itself; this list only
 *  keeps the UI from offering an invalid source. */
export function copySourceYears(
  startedAcademicYears: readonly number[],
  activeYear: number | null,
  offeringCountForYear: (year: number) => number,
): CopySourceYear[] {
  if (activeYear == null) return []
  return [...new Set(startedAcademicYears)]
    .filter((y) => y < activeYear)
    .sort((a, b) => b - a)
    .map((year) => ({ year, offeringCount: offeringCountForYear(year) }))
}

/** The source year the control defaults to: the most-recently-started year
 *  strictly before the active year that actually has Offerings to copy, falling
 *  back to the most-recently-started one when none do. `null` when there is no
 *  candidate at all. */
export function defaultCopySourceYear(sourceYears: readonly CopySourceYear[]): number | null {
  return (sourceYears.find((s) => s.offeringCount > 0) ?? sourceYears[0])?.year ?? null
}

/** Whether to render the "Copy Classes from {year}" control: there is a started
 *  year before the active one AND at least one such year has an Offering to
 *  copy. A source year that is currently deselected from the Global Academic
 *  Year Selection is not in the page's Offering set, so the affordance for that
 *  year is hidden until it is reselected — the RPC stays the authority either
 *  way (map #609, T5's "global selection is the candidate set" carried forward). */
export function copyClassesControlVisible(sourceYears: readonly CopySourceYear[]): boolean {
  return sourceYears.some((s) => s.offeringCount > 0)
}

/** The read-only Academic Year confirmation shown on the new-Class form (map
 *  #609, T9/#618). The active year is displayed for confirmation only — it is
 *  never a submitted field; `addClass` keeps stamping `active_academic_year`
 *  server-side, so the normal creation flow cannot place an Offering under an
 *  older year. A School with no active year yet (pre-backfill) shows nothing
 *  rather than a fabricated year, so this returns null in that case. */
export function newClassYearHint(activeYear: number | null): number | null {
  return typeof activeYear === 'number' ? activeYear : null
}

/** The shape copy_class_offerings_to_active_year returns. */
export interface CopyResult {
  copied: number
  skipped: number
}

export type CopyOutcomeKind = 'none' | 'partial' | 'all'

/** How the result panel reads a copy result:
 *   - `none`    — `copied === 0`: every source Offering already existed
 *   - `partial` — some copied, some skipped
 *   - `all`     — everything copied, nothing skipped */
export function copyOutcomeKind({ copied, skipped }: CopyResult): CopyOutcomeKind {
  if (copied === 0) return 'none'
  return skipped > 0 ? 'partial' : 'all'
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
