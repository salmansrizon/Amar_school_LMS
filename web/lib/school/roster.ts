import { classCatalogueOptions, resolveClassCatalogueSelection, type ClassCatalogueOption, type ClassCatalogueRow } from '@/lib/class-catalogue'
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

/** One student, as every roster screen needs them. */
export interface RosterStudent {
  id: string
  full_name: string
  roll_number: number | null
  class_name: string | null
  section: string | null
  guardian_name: string | null
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

/** Filter to a class/section and order the way a register is read: by roll,
 *  then by name for the students who have no roll yet. */
export function rosterFor(students: readonly RosterStudent[], className: string, section: string): RosterStudent[] {
  return students
    .filter((s) => (!className || s.class_name === className) && (!section || s.section === section))
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
    [s.full_name, s.guardian_name ?? '', s.roll_number?.toString() ?? ''].some((f) =>
      f.toLowerCase().includes(term),
    ),
  )
}

/** The class picker plus the decoded selection behind it. */
export function classSelection(classes: readonly ClassCatalogueRow[], classSectionId: string): {
  combos: ClassCatalogueOption[]
  className: string
  section: string
} {
  const combos = classCatalogueOptions(classes as ClassCatalogueRow[])
  return { combos, ...resolveClassCatalogueSelection(combos, classSectionId) }
}

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
