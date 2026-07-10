// Employees I helpers (issue #28): list filtering, kept pure for unit testing.

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

/** Comma-joined assigned shift names for an employee, "—" via null when none. */
export function employeeShiftNames(
  employeeId: string,
  assignments: { employee_id: string; shift_id: string }[],
  shifts: { id: string; name: string }[],
): string | null {
  const shiftMap = new Map(shifts.map((s) => [s.id, s.name]))
  const names = assignments
    .filter((a) => a.employee_id === employeeId)
    .map((a) => shiftMap.get(a.shift_id))
    .filter((n): n is string => Boolean(n))
  return names.length ? names.join(', ') : null
}
