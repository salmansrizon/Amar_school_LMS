// Students I/II helpers (issues #27, #46): list filtering, profile display,
// subject assignment and behaviour SMS bits, kept pure for unit testing.

import { pgConstraintMessage } from '@/lib/crud/pg-error'
import type { ClassCatalogueOption } from '@/lib/class-catalogue'

export interface StudentListRow {
  id: string
  full_name: string
  roll_number: number | null
  class_name: string | null
  section: string | null
  guardian_name: string | null
  archived_at: string | null
}

/** "Class 8 / A" — drops missing parts, null when nothing is set. OfficeTime left
 *  the student side with issue #100; class + section carry the grouping. */
export function classSectionLabel(
  className: string | null | undefined,
  section: string | null | undefined,
): string | null {
  const parts = [className, section].filter(Boolean)
  return parts.length ? parts.join(' / ') : null
}

/** Case-insensitive match on name, roll number or guardian name (list search). */
export function matchesStudentQuery(s: StudentListRow, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    s.full_name.toLowerCase().includes(q) ||
    (s.roll_number !== null && String(s.roll_number) === q) ||
    (s.guardian_name ?? '').toLowerCase().includes(q)
  )
}

// filterStudents moved to lib/school/roster.ts, split into `rosterFor` (class
// and section) and `searchRoster` (the free-text box). The page that called it
// also had to decide what an empty result MEANT, and got that wrong; the model
// answers both questions in one place now.

/** Per-student average rating from a flat (student_id, rating) list, 1 decimal. */
export function behaviourAverages(
  entries: { student_id: string; rating: number | null }[],
): Map<string, number> {
  const sums = new Map<string, { total: number; count: number }>()
  for (const e of entries) {
    if (e.rating === null) continue
    const acc = sums.get(e.student_id) ?? { total: 0, count: 0 }
    acc.total += e.rating
    acc.count += 1
    sums.set(e.student_id, acc)
  }
  const out = new Map<string, number>()
  for (const [id, { total, count }] of sums) out.set(id, Math.round((total / count) * 10) / 10)
  return out
}

/** Sections that exist for the selected class (all sections when unset).
 *
 *  Derived from `classCatalogueOptions()`'s own output (map #568/#582, Wave
 *  4a Part B) — one source, not a second independent `class_offerings`
 *  query duplicating the picker's own. A sectionless Offering's `section` is
 *  `''` in an option (class-catalogue.ts's own convention); `.filter(Boolean)`
 *  drops those here deliberately — a class with no sections at all has
 *  nothing to list in a Section dropdown, same as before. */
export function sectionsForClass(options: ClassCatalogueOption[], className: string): string[] {
  const pool = className ? options.filter((o) => o.className === className) : options
  return [...new Set(pool.map((o) => o.section).filter(Boolean))]
}

/** Distinct class names from `classCatalogueOptions()`'s output — the
 *  class-name half of Admission/Transfer's class-then-section cascade;
 *  `sectionsForClass` is the section half. `classCatalogueOptions` sorts
 *  (className, then section), so this now lists alphabetically rather than
 *  in first-occurrence/fetch order — a deliberate side effect of deriving
 *  from the one canonical source, not a second independent query, and it
 *  now matches Admission's own Offering picker's order. */
export function classNamesFor(options: ClassCatalogueOption[]): string[] {
  return [...new Set(options.map((o) => o.className))]
}

/** Roll numbering (issue #503): rolls are scoped per class+section, so the
 *  suggestion only looks at rows sharing both. */
export interface RollRow {
  class_name: string | null
  section: string | null
  roll_number: number | null
}

/** The roll to prefill on the admission form: the highest existing roll in
 *  this class+section plus the school's increment, or just the increment when
 *  the combination has no students yet — mirrors assign_student_roll's
 *  max()+increment (web/supabase/migrations/0120_student_roll_section_scope_increment.sql)
 *  so the shown suggestion matches what the trigger would assign if the field
 *  is left untouched. It's only a UI hint though (the field submits blank
 *  unless the operator types over it), so the two formulas have to be kept in
 *  sync by hand — a change to one without the other would just make the
 *  placeholder wrong, not the actual assigned roll. */
export function nextRollNumber(
  rolls: RollRow[],
  className: string,
  section: string,
  increment: number,
): number {
  const maxRoll = rolls
    .filter((r) => r.class_name === className && (r.section ?? '') === section)
    .reduce((max, r) => (r.roll_number !== null && r.roll_number > max ? r.roll_number : max), 0)
  return maxRoll + Math.max(1, increment)
}

/** Enrollment-scoped roll numbering (map #568/#582, issue #586): the same
 *  suggestion as nextRollNumber, keyed by class_offering_id instead of
 *  class_name+section text — mirrors assign_enrollment_roll's own
 *  max()+increment (0181_enrollment_roll_uniqueness.sql) so the placeholder
 *  stays in sync with what the trigger would actually assign, same caveat as
 *  nextRollNumber: this is a UI hint only, kept in sync by hand. */
export interface EnrollmentRollRow {
  class_offering_id: string
  roll_number: number | null
}

export function nextRollNumberForOffering(
  rolls: EnrollmentRollRow[],
  classOfferingId: string,
  increment: number,
): number {
  const maxRoll = rolls
    .filter((r) => r.class_offering_id === classOfferingId)
    .reduce((max, r) => (r.roll_number !== null && r.roll_number > max ? r.roll_number : max), 0)
  return maxRoll + Math.max(1, increment)
}

/** Validates a Roll Number field's raw text: blank is a valid "don't
 *  override" signal (→ null, same as never having typed anything), anything
 *  else must be a positive whole number. The `min={1}` on the field's native
 *  `<input>` is cosmetic only — admission-form.tsx builds FormData from a
 *  preventDefault'd submit, so the browser never runs its own constraint
 *  validation — so an out-of-range value is reported here rather than
 *  silently discarded the way a blank field is. */
export function parseRollNumber(raw: string): { value: number | null; error?: string } {
  const trimmed = raw.trim()
  if (!trimmed) return { value: null }
  const n = Number(trimmed)
  if (!Number.isInteger(n) || n < 1) return { value: null, error: 'Roll number must be a positive whole number' }
  return { value: n }
}

/** Whether a profile edit's class+section differs from the student's current
 *  row — a "scope change" (issue #503/#504). Rolls are section-scoped, and
 *  assign_student_roll only fires `before insert`, so the plain profile-edit
 *  path (unlike the dedicated sync_student_legacy_placement RPC, which
 *  already resets the roll on any scope change — 0120/0186 migrations) has
 *  to apply this same rule
 *  itself before deciding whether a blank Roll Number field may keep the
 *  student's existing roll. `current: null` (the row couldn't be read) reads
 *  as "no change" — the safer default, since a genuinely missing student is
 *  already caught by updateStudent's not-found check on the write itself. */
export function rollScopeChanged(
  current: { class_name: string | null; section: string | null } | null,
  next: { class_name: string | null; section: string | null },
): boolean {
  if (!current) return false
  return current.class_name !== next.class_name || current.section !== next.section
}

/** Turns the one DB constraint an operator can plausibly hit while filling in
 *  the profile form — a duplicate RFID Card Number within the school (issue
 *  #565's students_rfid_card_number_key) — into a message that says what to
 *  fix, instead of the raw Postgres constraint-violation text `error.message`
 *  would otherwise surface verbatim. A plain code-keyed lookup (this table's
 *  other unique constraint, students_roll_unique, can also 23505 from the
 *  same insert/update) would give the wrong message to a roll conflict, so
 *  this matches the constraint name itself via pgConstraintMessage. */
export function friendlyStudentError(error: { code: string; message: string }): string {
  return pgConstraintMessage(
    error,
    'students_rfid_card_number_key',
    'That RFID card number is already used by someone else at this school',
  )
}

const PHOTO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/** Storage extension for an allowed photo MIME type; null = not allowed. */
export function photoExtension(mimeType: string): string | null {
  return PHOTO_EXT[mimeType] ?? null
}

// Subject assignment (issue #46, PRD §5.1) helpers.

export interface SubjectOption {
  id: string
  name: string
  class_id: string | null
}

/** A class's assignable catalogue: subjects linked to it, plus school-wide ones.
 * Generic so callers carrying extra columns (e.g. exam-setup.html's mark
 * config, issue #47) keep them through the filter instead of narrowing to
 * SubjectOption's bare shape. */
export function subjectsForClass<T extends SubjectOption>(subjects: T[], classId: string): T[] {
  return subjects.filter((s) => s.class_id === null || s.class_id === classId)
}

const MAX_NOTE_CHARS = 80

/** SMS body for a behaviour-record send — kept short (single segment budget). */
export function behaviourSmsBody(studentName: string, note: string, rating: number): string {
  const trimmed = note.length > MAX_NOTE_CHARS ? `${note.slice(0, MAX_NOTE_CHARS)}…` : note
  return `Behaviour note for ${studentName} (rating ${rating}/10): ${trimmed}`
}

/** Stands in for the password in the stored copy of a login SMS — the Send Log
 *  is readable by any staff member with the SMS screen. */
export const PASSWORD_MASK = '********'

/** SMS body handing a Student's login to their guardian (#442). Single-segment
 *  budget, same as behaviourSmsBody. Pass PASSWORD_MASK to build the copy that
 *  goes into sms_log. */
export function studentLoginSmsBody(
  studentName: string,
  email: string,
  password: string,
): string {
  return `${studentName} student login — user: ${email} pass: ${password}`
}
