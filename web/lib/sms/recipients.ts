// Recipient-list resolution for SMS compose (PRD §5.7). Pure functions over
// already-fetched School-scoped rows (RLS has already limited these to the
// caller's School) so the exact same logic backs both the server action that
// sends and the client-side "estimated recipients" live preview.

import {
  targetMatchesOffering,
  toCandidateOffering,
  type OfferingRow,
  type PublicationTarget,
  type TargetScope,
} from '@/lib/publishing'
import { classCatalogueLabel } from '@/lib/class-catalogue'
import { firstRelation } from '@/lib/supabase/relation'

export type ComposeMode = 'class_section' | 'group' | 'manual'

// Shared `.select()` column lists — the compose page (for the initial fetch +
// live "estimated recipients" preview) and the sendCompose server action (for
// the actual send) must resolve recipients from the exact same shape.
//
// Class/Section/Shift/Group Department come from the Student's CURRENT
// Enrollment's Class Offering (map #598 Wave 5, #606), never
// `students.class_name`/`section` text — the same Enrollment-based join every
// #593 consumer already uses (see `lib/school/roster-source.ts`). A left embed,
// not `!inner`: a Student with no current Enrollment must still come back (with
// a null `student_enrollments`) so an `all`-scope send still reaches them.
export const COMPOSE_STUDENT_COLUMNS = `id, full_name, guardian_phone,
  student_enrollments!students_current_enrollment_id_fkey(
    class_offerings(id, name, section, group_department, shift, academic_year))`
export const COMPOSE_EMPLOYEE_COLUMNS = 'id, full_name, category, mobile'

interface ComposeEnrollmentEmbed {
  class_offerings: OfferingRow[]
}

export interface ComposeStudentRow {
  id: string
  full_name: string
  guardian_phone: string | null
  student_enrollments: ComposeEnrollmentEmbed[]
}

export interface ComposeEmployeeRow {
  id: string
  full_name: string
  category: string | null
  mobile: string | null
}

export interface Recipient {
  phone: string
  name: string
  studentId?: string
  employeeId?: string
}

/** The Student's CURRENT Enrollment's Class Offering, or null when unplaced
 *  (`current_enrollment_id is null` — #569's own valid state). Unwraps the two
 *  to-one embeds the same way `roster-source.ts` does. */
export function studentOffering(student: ComposeStudentRow): OfferingRow | null {
  const enrollment = firstRelation(student.student_enrollments)
  return enrollment ? firstRelation(enrollment.class_offerings) : null
}

/** The compose picker's raw string fields, before they become a
 *  `PublicationTarget`. Empty string = Any (the "All …" option). */
export interface ClassTargetInput {
  scope: TargetScope
  /** Set only for scope === 'offering'. */
  offeringId: string
  /** scope === 'broadcast': the Class name (`class_offerings.name` text). */
  className: string
  /** scope === 'broadcast': '' = Any. */
  shift: string
  /** scope === 'broadcast': '' = Any. */
  groupDepartment: string
  /** scope === 'broadcast': '' = Any. */
  section: string
}

/** Build the shared Offering-aware targeting predicate input from the compose
 *  picker's raw fields. Academic Year is never a picker field — a broadcast is
 *  always pinned to the School's active Academic Year at send time (#599), so
 *  the caller passes it in. The exact same call runs client-side for the live
 *  preview and server-side for the send, so the two can never resolve
 *  differently. */
export function classTargetFromInput(
  input: ClassTargetInput,
  activeAcademicYear: number | null,
): PublicationTarget {
  const empty: PublicationTarget = {
    scope: input.scope,
    classOfferingId: null,
    className: null,
    academicYear: null,
    shift: null,
    groupDepartment: null,
    section: null,
  }
  if (input.scope === 'offering') return { ...empty, classOfferingId: input.offeringId || null }
  if (input.scope === 'broadcast') {
    return {
      ...empty,
      className: input.className || null,
      academicYear: activeAcademicYear,
      shift: input.shift || null,
      groupDepartment: input.groupDepartment || null,
      section: input.section || null,
    }
  }
  return empty
}

/** Class-targeted recipients (map #598 Wave 5, #606): the shared
 *  Offering-aware predicate (`targetMatchesOffering`, `lib/publishing.ts`)
 *  against each Student's CURRENT Enrollment's Class Offering — the same
 *  resolution the Notices/Homework consumers use, never a
 *  `students.class_name`/`section` text match. An `all` target reaches every
 *  Student regardless of Enrollment; an `offering`/`broadcast` target reaches
 *  only Students with a current Enrollment whose Offering matches. Students
 *  without a guardian phone on file are silently skipped rather than erroring. */
export function resolveClassTargetRecipients(
  students: ComposeStudentRow[],
  target: PublicationTarget,
): Recipient[] {
  return students
    .filter((s): s is ComposeStudentRow & { guardian_phone: string } => !!s.guardian_phone)
    .filter((s) => {
      if (target.scope === 'all') return true
      const offering = studentOffering(s)
      return offering !== null && targetMatchesOffering(target, toCandidateOffering(offering))
    })
    .map((s) => ({ phone: s.guardian_phone, name: s.full_name, studentId: s.id }))
}

/** The Send Log's free-text recipient label for a class-targeted send (map
 *  #598 Wave 5, #606) — replaces the old `[className, section].join(' / ')`.
 *  `all` → null (the log shows a dash), `offering` → the picked Offering's
 *  Class Catalogue label, `broadcast` → the Class name plus every non-Any
 *  dimension, ' / '-joined (the Year is implicit — always the active Academic
 *  Year at send time — so it is not spelled out). `recipient_label` is a plain
 *  display string on `sms_log`, read only by the Send Log screen
 *  (`lib/sms/log.ts`), so any shape is safe. */
export function formatClassTargetLabel(
  target: PublicationTarget,
  offering: { name: string; section: string | null; group_department?: string | null; shift?: string | null } | null,
): string | null {
  if (target.scope === 'all') return null
  if (target.scope === 'offering') return offering ? classCatalogueLabel(offering) : null
  return [target.className, target.shift, target.groupDepartment, target.section].filter(Boolean).join(' / ') || null
}

/** Teacher/Staff/Management group recipients: grouped by the School's own
 *  free-text employee category (same categories as Employees § grace config —
 *  there is no fixed teacher/staff/management enum in the schema). */
export function resolveGroupRecipients(employees: ComposeEmployeeRow[], category: string): Recipient[] {
  if (!category) return []
  return employees
    .filter((e) => e.category === category)
    .filter((e): e is ComposeEmployeeRow & { mobile: string } => !!e.mobile)
    .map((e) => ({ phone: e.mobile, name: e.full_name, employeeId: e.id }))
}

/** Manual numbers: comma-separated, trimmed, blanks and duplicates dropped. */
export function parseManualNumbers(raw: string): Recipient[] {
  const seen = new Set<string>()
  const recipients: Recipient[] = []
  for (const part of raw.split(',')) {
    const phone = part.trim()
    if (!phone || seen.has(phone)) continue
    seen.add(phone)
    recipients.push({ phone, name: phone })
  }
  return recipients
}

export function resolveRecipients(
  mode: ComposeMode,
  input: {
    students: ComposeStudentRow[]
    employees: ComposeEmployeeRow[]
    target: PublicationTarget
    category: string
    manualNumbers: string
  },
): Recipient[] {
  if (mode === 'class_section') return resolveClassTargetRecipients(input.students, input.target)
  if (mode === 'group') return resolveGroupRecipients(input.employees, input.category)
  return parseManualNumbers(input.manualNumbers)
}
