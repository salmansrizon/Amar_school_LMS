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
