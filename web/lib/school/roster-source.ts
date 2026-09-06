import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveClassSection, type ClassCatalogueOption, type ClassCatalogueRow } from '@/lib/class-catalogue'
import { firstRelation } from '@/lib/supabase/relation'
import { classScopeFor } from '@/lib/school/class-scope'
import { applyGlobalShiftFilterToOfferings } from '@/lib/school/shift-filter'
import {
  latestMark,
  markedByOf,
  registerRows,
  rosterEmptyReason,
  rosterFor,
  searchRoster,
  type AttendanceMark,
  type MarkedBy,
  type RegisterRow,
  type RosterEmptyReason,
  type RosterStudent,
} from '@/lib/school/roster'

// The adapter for the School roster model: rows in, view model out.
//
// Everything RLS-scoped, nothing decided here — the decisions live in
// `roster.ts` where they can be tested without a database. This file exists to
// be the one place that knows WHICH columns and WHICH tables a roster screen
// reads, so adding a column is one edit rather than four (ADR 0008's
// Application layer, arriving one screen at a time as web/AGENTS.md asks).

/** The select list every roster screen shares. Archived students are excluded
 *  by every caller: a student who has left is not on a register, not in a fee
 *  roster, and not in the list an Owner manages.
 *
 *  `roll_number`/`class_offering_id` (and its `name`/`section`) come from the
 *  Student's CURRENT Enrollment, not the legacy `students.class_name`/
 *  `section`/`roll_number` bridge (map #568/#582, Wave 4a Part B — blocked on
 *  Wave 6's backfill, which has now landed, #591). A left embed, not `!inner`:
 *  an unplaced Student (`current_enrollment_id is null`) must still come back
 *  with a null `student_enrollments`, not be dropped — the same "all Students
 *  visible under All classes" contract the text bridge always had (#569's "no
 *  current Enrollment is a valid state"). `current_enrollment_id` can only
 *  ever point at an OPEN Enrollment by construction (`set_student_enrollment`
 *  closes the old one and repoints it atomically in the same transaction), so
 *  there is no separate `closed_at` to filter here. */
const ROSTER_COLUMNS = `id, full_name, guardian_name,
  student_enrollments!students_current_enrollment_id_fkey(roll_number, class_offering_id,
    class_offerings(name, section))`

interface EnrollmentEmbed {
  roll_number: number | null
  class_offering_id: string | null
  class_offerings: { name: string; section: string | null }[]
}

interface StudentRow {
  id: string
  full_name: string
  guardian_name: string | null
  student_enrollments: EnrollmentEmbed[]
}

function toRosterStudent(row: StudentRow): RosterStudent {
  const enrollment = firstRelation(row.student_enrollments)
  const offering = enrollment ? firstRelation(enrollment.class_offerings) : null
  return {
    id: row.id,
    full_name: row.full_name,
    guardian_name: row.guardian_name,
    roll_number: enrollment?.roll_number ?? null,
    class_offering_id: enrollment?.class_offering_id ?? null,
    class_name: offering?.name ?? null,
    section: offering?.section ?? null,
  }
}

export interface RosterView {
  combos: ClassCatalogueOption[]
  className: string
  section: string
  /** Filtered and ordered — what the screen renders. */
  students: RosterStudent[]
  /** Null when `students` is non-empty; otherwise WHY it is empty. */
  empty: RosterEmptyReason | null
  classes: ClassCatalogueRow[]
}

/**
 * The roster behind a School screen: students the caller may read, narrowed by
 * the screen's class filter and search box, plus the reason it is empty.
 *
 * The empty reason is the point. Every screen used to decide it inline, and
 * `students/page.tsx` got it wrong in a way no test could see: it asked the
 * class-scope question against the UNFILTERED count and then rendered the answer
 * over the FILTERED list, so a search matching nothing told an Owner their
 * school had no students and offered to admit one.
 */
export async function schoolRoster(
  supabase: SupabaseClient,
  {
    classSection = '',
    q = '',
    shiftSelection = [],
  }: { classSection?: string; q?: string; shiftSelection?: readonly string[] } = {},
): Promise<RosterView> {
  // Shift (issue #579, Wave 5/#590): only narrows which classes appear as
  // picker OPTIONS below — orthogonal to the roster's own filter, which is
  // now the Enrollment's class_offering_id (see ROSTER_COLUMNS). Caller
  // passes its own getSchoolContext().shiftSelection — already resolved once
  // per request, no re-fetch needed here.
  const [{ data: students }, { data: classes }] = await Promise.all([
    supabase.from('students').select(ROSTER_COLUMNS).is('archived_at', null).order('full_name'),
    applyGlobalShiftFilterToOfferings(
      supabase.from('class_offerings').select('id, name, section, group_department, shift').order('created_at'),
      shiftSelection,
    ),
  ])

  const readable = ((students ?? []) as StudentRow[]).map(toRosterStudent)
  // classSection IS the picked Class Offering's id already (classCatalogueOptions'
  // own `value`) — rosterFor filters on it directly, no text round-trip.
  // combos/className/section stay purely for display (picker options, print
  // headings) via the one canonical helper (class-catalogue.ts), not a second
  // one duplicating it (map #568/#582, Wave 4a Part B).
  const { combos, className, section } = resolveClassSection((classes ?? []) as ClassCatalogueRow[], classSection)
  // An id that doesn't match any current Offering (deleted, mistyped, a stale
  // bookmark/printout) must degrade to "All classes", same as an absent
  // filter — resolveClassCatalogueSelection's own documented contract, which
  // filtering on the raw classSection directly would silently break (caught
  // by code review): a non-matching id would filter to zero students instead
  // of falling back, even though the picker still reads as "All" selected.
  const resolvedOfferingId = combos.some((c) => c.value === classSection) ? classSection : ''
  const matched = searchRoster(rosterFor(readable, resolvedOfferingId), q)

  // 0160 narrows this read to the caller's class attachment, so an Employee with
  // no attachment gets nothing back. Ask why only when the answer matters — the
  // RPC is a round-trip, and a non-empty roster has already answered it.
  const scope = matched.length || readable.length ? 'attached' : await classScopeFor(supabase)

  return {
    combos,
    className,
    section,
    students: matched,
    empty: rosterEmptyReason({ readable: readable.length, matched: matched.length, scope }),
    classes: (classes ?? []) as ClassCatalogueRow[],
  }
}

export interface RegisterView extends RosterView {
  /** The register as the form edits it. */
  rows: RegisterRow[]
  /** When and by whom this date was last marked, or null if never (#540). */
  markedBy: MarkedBy | null
}

/**
 * One day's student register: the roster, the marks already on it, and who put
 * them there.
 *
 * Absence is the absence of a record (0046), so both tables have to be read to
 * tell "nobody has taken this" from "everyone was present" — and the marker's
 * name is a third read, made only when there is a mark to attribute.
 */
export async function studentRegister(
  supabase: SupabaseClient,
  {
    classSection = '',
    date,
    viewerId,
    shiftSelection = [],
  }: { classSection?: string; date: string; viewerId: string; shiftSelection?: readonly string[] },
): Promise<RegisterView> {
  const view = await schoolRoster(supabase, { classSection, shiftSelection })
  const ids = view.students.map((s) => s.id)
  if (!ids.length) return { ...view, rows: [], markedBy: null }

  const [{ data: records }, { data: notes }] = await Promise.all([
    supabase
      .from('attendance_records')
      .select('person_id, marked_by, marked_at')
      .eq('person_type', 'student')
      .eq('att_date', date)
      .in('person_id', ids),
    supabase
      .from('attendance_absence_notes')
      .select('person_id, cause, marked_by, marked_at')
      .eq('person_type', 'student')
      .eq('att_date', date)
      .in('person_id', ids),
  ])

  const latest = latestMark([...(records ?? []), ...(notes ?? [])] as AttendanceMark[])
  // The marker's name is readable by the Owner (0001 lets an Owner read their
  // school's profiles) and by the marker themselves. A Staff User looking at a
  // colleague's mark gets the time without the name rather than an error.
  const { data: marker } = latest?.marked_by
    ? await supabase.from('profiles').select('full_name').eq('id', latest.marked_by).maybeSingle()
    : { data: null }

  return {
    ...view,
    rows: registerRows(
      view.students,
      new Set((records ?? []).map((r) => r.person_id as string)),
      new Map((notes ?? []).map((n) => [n.person_id as string, (n.cause as string | null) ?? ''])),
    ),
    markedBy: markedByOf(latest, marker?.full_name ?? null, viewerId),
  }
}
