import type { ClassScope } from '@/lib/school/class-scope'

// The School-side roster, as a model rather than as a query repeated on every
// screen that needs one.
//
// Four screens used to assemble this by hand — students, attendance marking,
// fees, classes — each fetching `students` and `classes`, each calling
// resolveClassSection, each filtering and sorting, each deciding for itself what
// an empty list means. The pure pieces (filterRoster, latestMark) were tested;
// the assembly around them was reachable only through a browser, which is where
// both of this release's worst defects lived: a Class Teacher reading 82
// children, and a fee page that rendered no form.
//
// This file is the model. `roster-source.ts` is the adapter that fills it from
// Supabase. A page renders what comes back and decides nothing.

/** One student, as every roster screen needs them.
 *
 *  `roll_number`/`class_name`/`section`/`class_offering_id` come from the
 *  Student's CURRENT Enrollment (map #568/#582, Wave 4a Part B) — null for a
 *  Student with no current placement (`current_enrollment_id is null`),
 *  which is a valid, visible state (#569), not an error. This replaced the
 *  legacy `students.class_name`/`section` text bridge, which only ever
 *  agreed with the Enrollment by construction (kept in sync by
 *  admit/transfer/promote) and could drift via `updateStudent`'s
 *  deliberately-unsynced profile-edit path (#587's own carry-forward note).
 *
 *  `class_name`/`section`/`roll_number` DO still fall back to that legacy text
 *  bridge (`roster-source.ts`'s `toRosterStudent`) when the Enrollment embed
 *  is empty — the same fallback the record drawer and the ID card already
 *  render, so a Student the backfill never reached shows the same class/roll
 *  everywhere instead of "—" only in this list (map 013 fix). Only the
 *  *label* borrows the legacy value; `class_offering_id` (what `rosterFor`
 *  filters on) is never backed by it. */
export interface RosterStudent {
  id: string
  full_name: string
  roll_number: number | null
  class_name: string | null
  section: string | null
  guardian_name: string | null
  /** Student Number (CONTEXT.md) — optional so screens that build rosters by
   *  hand need not carry it. */
  student_no?: string | null
  guardian_mobile?: string | null
  /** Admission time — the Student row's own created_at. */
  created_at?: string
  /** The Offering this Student's current Enrollment points at, or null when
   *  unplaced. What `rosterFor` actually filters on — never the text pair. */
  class_offering_id: string | null
  /** The rest of the current Enrollment's Offering — group/shift/year — added
   *  so a roster screen can render the full shared Class Catalogue label
   *  (`classCatalogueLabel`, `lib/class-catalogue.ts`) instead of a bare
   *  `class_name`/`section` join. Null whenever `class_name` is (unplaced),
   *  and independently null for any field the Offering itself never set. */
  group_department: string | null
  shift: string | null
  academic_year: number | null
}

/** A Student row plus its (already-unwrapped) current-Enrollment Offering, if
 *  any — the shape `roster-source.ts`'s adapter hands in after its Supabase
 *  embed is unwrapped by `firstRelation`. */
export interface RosterStudentInput {
  id: string
  full_name: string
  guardian_name: string | null
  student_no?: string | null
  guardian_mobile?: string | null
  created_at?: string
  /** The legacy text-bridge columns (#587) — display fallback only. */
  class_name: string | null
  section: string | null
  roll_number: number | null
}

export interface EnrollmentInput {
  roll_number: number | null
  class_offering_id: string | null
}

export interface OfferingInput {
  name: string
  section: string | null
  group_department: string | null
  shift: string | null
  academic_year: number | null
}

/** Fold a Student with its current Enrollment's Offering (or null, unplaced)
 *  into the roster's display shape — the fallback-to-legacy-text decision
 *  (see `RosterStudent`'s own doc) kept here, not in `roster-source.ts`, so
 *  it is tested without a database (this file's own stated purpose). */
export function resolveRosterStudent(
  row: RosterStudentInput,
  enrollment: EnrollmentInput | null,
  offering: OfferingInput | null,
): RosterStudent {
  return {
    id: row.id,
    full_name: row.full_name,
    guardian_name: row.guardian_name,
    student_no: row.student_no,
    guardian_mobile: row.guardian_mobile,
    created_at: row.created_at,
    roll_number: enrollment?.roll_number ?? row.roll_number,
    class_offering_id: enrollment?.class_offering_id ?? null,
    class_name: offering?.name ?? row.class_name,
    section: offering ? offering.section : row.section,
    group_department: offering?.group_department ?? null,
    shift: offering?.shift ?? null,
    academic_year: offering?.academic_year ?? null,
  }
}

/**
 * Why a roster is empty — the distinction a blank table cannot make on its own.
 *
 * - `unassigned` — the caller is an Employee with no class attachment, so 0160
 *   narrows their read to nothing. "No students yet" would be a lie in a school
 *   of hundreds; the way out is an Owner assigning them a class (ADR 0021).
 * - `no-students` — the school genuinely has none. The way out is admission.
 * - `no-match`  — the school HAS students; this filter matched none of them. The
 *   way out is clearing the filter, and offering "add a student" here is the
 *   conflation #538 exists to forbid.
 */
export type RosterEmptyReason = 'unassigned' | 'no-students' | 'no-match'

export function rosterEmptyReason(args: {
  /** Rows the caller can read at all, before this screen's filters. */
  readable: number
  /** Rows left after the filters. */
  matched: number
  /** The caller's class scope, resolved only when `readable` is 0. */
  scope: ClassScope
}): RosterEmptyReason | null {
  if (args.matched > 0) return null
  if (args.readable > 0) return 'no-match'
  return args.scope === 'none' ? 'unassigned' : 'no-students'
}

/** Filter to one Class Offering (by id — empty means "All classes") and order
 *  the way a register is read: by roll, then by name for the students who
 *  have no roll yet. An unplaced Student (`class_offering_id` null) never
 *  matches a specific filter, but always appears under "All classes" —
 *  the same contract the old text filter had, just keyed on the Offering id
 *  instead of a `class_name`/`section` pair. */
export function rosterFor(students: readonly RosterStudent[], classOfferingId: string): RosterStudent[] {
  return students
    .filter((s) => !classOfferingId || s.class_offering_id === classOfferingId)
    .toSorted((a, b) => {
      if (a.roll_number != null && b.roll_number != null) return a.roll_number - b.roll_number
      if (a.roll_number != null) return -1
      if (b.roll_number != null) return 1
      return a.full_name.localeCompare(b.full_name)
    })
}

/** Free-text search over the three fields an office actually searches by. */
export function searchRoster(students: readonly RosterStudent[], q: string): RosterStudent[] {
  const term = q.trim().toLowerCase()
  if (!term) return [...students]
  return students.filter((s) =>
    [s.full_name, s.guardian_name ?? '', s.roll_number?.toString() ?? '', s.student_no ?? '', s.guardian_mobile ?? ''].some((f) =>
      f.toLowerCase().includes(term),
    ),
  )
}

// The class picker plus the decoded selection behind it used to be duplicated
// here as `classSelection` — byte-for-byte identical to `resolveClassSection`
// in `class-catalogue.ts`. `roster-source.ts` now calls that one directly
// (map #568/#582, Wave 4a Part B): one canonical helper, not two.

// ---------------------------------------------------------------- register

/** A manual mark, from either table that records one (0170). */
export interface AttendanceMark {
  marked_by: string | null
  marked_at: string | null
}

/** When and by whom a date was last marked, or null if nobody has taken it. */
export interface MarkedBy {
  at: string
  /** Null when the marker's profile is not readable by this caller — a Staff
   *  User may read only their own (0001), so a teacher sees the time and the
   *  Owner sees the name. */
  name: string | null
  isSelf: boolean
}

/**
 * The most recent manual mark for a date, or null if nobody has taken it.
 *
 * A day is marked across two tables — present students in `attendance_records`,
 * absent ones in `attendance_absence_notes` — so neither alone answers "has this
 * register been taken". Null is what lets the screen say "not taken yet" instead
 * of showing a roster that looks like everyone was present (#540).
 *
 * Rows written by the RFID job carry no `marked_at` (nobody marked them) and are
 * skipped rather than treated as the latest: the question is who last took the
 * register by hand.
 */
export function latestMark(marks: readonly AttendanceMark[]): AttendanceMark | null {
  return marks.filter((m) => m.marked_at).toSorted((a, b) => (a.marked_at! < b.marked_at! ? 1 : -1))[0] ?? null
}

export function markedByOf(
  latest: AttendanceMark | null,
  markerName: string | null,
  viewerId: string,
): MarkedBy | null {
  if (!latest?.marked_at) return null
  return { at: latest.marked_at, name: markerName, isSelf: latest.marked_by === viewerId }
}

/** One editable row of the register. */
export interface RegisterRow {
  id: string
  full_name: string
  roll_number: number | null
  present: boolean
  cause: string
}

/**
 * The register as the form edits it.
 *
 * Absence is inferred from the ABSENCE of an attendance_records row (0046), not
 * from a status value — so a student with neither a record nor a note reads as
 * present, and that default is only honest because the screen says the register
 * has not been taken yet (see `latestMark`).
 */
export function registerRows(
  students: readonly RosterStudent[],
  presentIds: ReadonlySet<string>,
  causeByStudent: ReadonlyMap<string, string>,
): RegisterRow[] {
  return students.map((s) => ({
    id: s.id,
    full_name: s.full_name,
    roll_number: s.roll_number,
    present: presentIds.has(s.id) || !causeByStudent.has(s.id),
    cause: causeByStudent.get(s.id) ?? '',
  }))
}
