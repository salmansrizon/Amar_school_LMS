// Employees I helpers (issue #28): list filtering, kept pure for unit testing.

import { pgConstraintMessage } from '@/lib/crud/pg-error'

export interface EmployeeListRow {
  id: string
  full_name: string
  category: string | null
  qualification: string | null
  department: string | null
  archived_at: string | null
}

/** Case-insensitive match on name (list search). */
export function matchesEmployeeQuery(e: { full_name: string }, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return e.full_name.toLowerCase().includes(q)
}

export function filterEmployees<T extends EmployeeListRow>(
  employees: T[],
  query: string,
  category: string,
): T[] {
  return employees.filter(
    (e) => matchesEmployeeQuery(e, query) && (!category || e.category === category),
  )
}

/** Comma-joined assigned officeTime names for an employee, "—" via null when none. */
export function employeeOfficeTimeNames(
  employeeId: string,
  assignments: { employee_id: string; office_time_id: string }[],
  officeTimes: { id: string; name: string }[],
): string | null {
  const officeTimeMap = new Map(officeTimes.map((s) => [s.id, s.name]))
  const names = assignments
    .filter((a) => a.employee_id === employeeId)
    .map((a) => officeTimeMap.get(a.office_time_id))
    .filter((n): n is string => Boolean(n))
  return names.length ? names.join(', ') : null
}

/** Turns the one DB constraint an operator can plausibly hit while filling in
 *  the profile form — a duplicate RFID Card Number within the school (issue
 *  #565's employees_rfid_card_number_key) — into a message that says what to
 *  fix, instead of the raw Postgres constraint-violation text `error.message`
 *  would otherwise surface verbatim. Constraint-name-keyed via
 *  pgConstraintMessage (see friendlyStudentError, lib/students.ts, for why —
 *  same reasoning applies here even though employees has no second unique
 *  constraint reachable from this call site yet). */
export function friendlyEmployeeError(error: { code: string; message: string }): string {
  return pgConstraintMessage(
    error,
    'employees_rfid_card_number_key',
    'That RFID card number is already used by someone else at this school',
  )
}

/** Validates the optional Login section on the Add Employee form (issue
 *  #566, folding in what used to be the separate "Add a teacher" flow,
 *  #533). Email and password are both-or-neither: one without the other is
 *  a malformed submission — a forgotten password field, or an email typo'd
 *  into the wrong box — not "no login wanted", so it's rejected rather than
 *  silently creating the employee with half a login request dropped.
 *  Returns `{}` (nothing to stop the submit for) when both are blank, both
 *  are present and valid, or the caller isn't asking for a login. */
export function validateOptionalLogin(email: string, password: string): { error?: string } {
  if (Boolean(email) !== Boolean(password)) {
    return { error: 'Provide both an email and a password to create a login, or leave both blank' }
  }
  if (email && password.length < 8) return { error: 'Password must be at least 8 characters' }
  return {}
}

/** The fixed set an Employee's `category` is locked to (issue #567) — the
 *  canonical English strings, matched against whatever's actually stored
 *  (seed data, and every cross-referencing table: category_grace_minutes,
 *  SMS recipient filters, satisfaction-rating breakdowns) regardless of the
 *  UI's current language. Both entry forms render a `<select>` restricted
 *  to these; this list is what the server checks a submission against so a
 *  direct POST can't smuggle an arbitrary string past the dropdown. */
export const EMPLOYEE_CATEGORIES = ['Teacher', 'Office Staff', 'Management', 'Security'] as const

/** Whether `category` is one of the fixed four — shared by the validator
 *  below and the edit form's "is this a legacy value?" check, so the
 *  membership test and its `as readonly string[]` cast exist in one place. */
export function isKnownEmployeeCategory(category: string): boolean {
  return (EMPLOYEE_CATEGORIES as readonly string[]).includes(category)
}

/** Validates the `category` field against the fixed list (issue #567).
 *  Blank/null is always fine — the field stays optional, unchanged from
 *  before this ticket. A value outside the fixed four is only accepted when
 *  it equals `existing` (the employee's own value already in the database):
 *  real rows can predate this ticket (the seed data itself has a "Head
 *  Teacher") or have been typed in before the field was locked down, and
 *  re-saving an edit without touching Category must not fail just because
 *  the fixed list doesn't happen to include whatever's already there. */
export function validateEmployeeCategory(
  category: string | null,
  existing: string | null = null,
): { error?: string } {
  if (!category) return {}
  if (isKnownEmployeeCategory(category)) return {}
  if (category === existing) return {}
  return { error: 'Category must be Teacher, Office Staff, Management, or Security' }
}
