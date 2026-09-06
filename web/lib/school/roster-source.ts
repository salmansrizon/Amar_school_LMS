import type { SupabaseClient } from '@supabase/supabase-js'
import type { ClassCatalogueOption, ClassCatalogueRow } from '@/lib/class-catalogue'
import { classScopeFor } from '@/lib/school/class-scope'
import { applyGlobalShiftFilterToOfferings } from '@/lib/school/shift-filter'
import {
  classSelection,
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
 *  roster, and not in the list an Owner manages. */
const ROSTER_COLUMNS = 'id, full_name, roll_number, class_name, section, guardian_name'

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
  // picker OPTIONS below — the roster itself still resolves via
  // rosterFor's class_name/section text match (see the comment on that
  // just below), entirely independent of this list, so filtering it here
  // is safe on its own even though the roster match beside it is not yet
  // enrollment-based. Caller passes its own getSchoolContext().shiftSelection
  // — already resolved once per request, no re-fetch needed here.
  const [{ data: students }, { data: classes }] = await Promise.all([
    supabase.from('students').select(ROSTER_COLUMNS).is('archived_at', null).order('full_name'),
    applyGlobalShiftFilterToOfferings(
      supabase.from('class_offerings').select('id, name, section, group_department, shift').order('created_at'),
      shiftSelection,
    ),
  ])

  const readable = (students ?? []) as RosterStudent[]
  // Still narrowed by class_name/section text, deliberately (map #568/#582,
  // Wave 4a): the offering id the picker submits is resolved back down to a
  // text pair here rather than used as a join key. Moving this onto
  // student_enrollments.class_offering_id is Wave 4a's "Part B" and is blocked
  // on Wave 6's backfill — every pre-existing Student has a null
  // current_enrollment_id, so an enrollment join today returns zero rows for
  // Owners and office staff, who are the only roles this path still works for.
  // Not an oversight; do not "fix" it before the backfill lands.
  const { combos, className, section } = classSelection((classes ?? []) as ClassCatalogueRow[], classSection)
  const matched = searchRoster(rosterFor(readable, className, section), q)

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
