// Recipient-list resolution for SMS compose (PRD §5.7). Pure functions over
// already-fetched School-scoped rows (RLS has already limited these to the
// caller's School) so the exact same logic backs both the server action that
// sends and the client-side "estimated recipients" live preview.

export type ComposeMode = 'class_shift_section' | 'group' | 'manual'

// Shared `.select()` column lists — the compose page (for the initial fetch +
// live "estimated recipients" preview) and the sendCompose server action (for
// the actual send) must resolve recipients from the exact same shape.
export const COMPOSE_STUDENT_COLUMNS = 'id, full_name, class_name, section, shift_id, guardian_phone'
export const COMPOSE_EMPLOYEE_COLUMNS = 'id, full_name, category, mobile'

export interface ComposeStudentRow {
  id: string
  full_name: string
  class_name: string | null
  section: string | null
  shift_id: string | null
  guardian_phone: string | null
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

export interface ClassShiftSectionFilter {
  className?: string | null
  shiftId?: string | null
  section?: string | null
}

/** Class/Shift/Section recipients: a blank filter field means "any" (matches
 *  the mockup's "All Shifts"/"All Sections" options); students without a
 *  recorded guardian phone are silently skipped rather than erroring, since
 *  a school-wide send should still reach everyone who has a number on file. */
export function resolveClassShiftSectionRecipients(
  students: ComposeStudentRow[],
  filter: ClassShiftSectionFilter,
): Recipient[] {
  return students
    .filter((s) => !filter.className || s.class_name === filter.className)
    .filter((s) => !filter.shiftId || s.shift_id === filter.shiftId)
    .filter((s) => !filter.section || s.section === filter.section)
    .filter((s): s is ComposeStudentRow & { guardian_phone: string } => !!s.guardian_phone)
    .map((s) => ({ phone: s.guardian_phone, name: s.full_name, studentId: s.id }))
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
    filter: ClassShiftSectionFilter
    category: string
    manualNumbers: string
  },
): Recipient[] {
  if (mode === 'class_shift_section') return resolveClassShiftSectionRecipients(input.students, input.filter)
  if (mode === 'group') return resolveGroupRecipients(input.employees, input.category)
  return parseManualNumbers(input.manualNumbers)
}
