// Employees I helpers (issue #28): list filtering, kept pure for unit testing.

import { t, type Lang, type MessageKey } from '@/lib/i18n'
import { toLatinDigits } from '@/lib/bd-mobile'

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

/** Directory search box: name, mobile or machine id, case-insensitive, Bangla
 *  or Latin digits. `unique_id` comes back from Postgres as a number (0211), so
 *  every field is coerced to a string here once — the search must never assume
 *  a column's runtime type. */
export function matchesEmployeeDirectoryQuery(
  e: { full_name: string; mobile?: string | number | null; unique_id?: string | number | null },
  query: string,
): boolean {
  const needle = toLatinDigits(query.trim().toLowerCase())
  if (!needle) return true
  return [e.full_name, e.mobile, e.unique_id].some((f) => toLatinDigits(String(f ?? '').toLowerCase()).includes(needle))
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


const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Validates the optional Login section on the Add Employee form (issue
 *  #566, folding in what used to be the separate "Add a teacher" flow,
 *  #533). Email and password are both-or-neither: one without the other is
 *  a malformed submission — a forgotten password field, or an email typo'd
 *  into the wrong box — not "no login wanted", so it's rejected rather than
 *  silently creating the employee with half a login request dropped.
 *  Returns `{}` (nothing to stop the submit for) when both are blank, both
 *  are present and valid, or the caller isn't asking for a login. */
export function validateOptionalLogin(email: string, password: string, lang: Lang = 'en'): { error?: string } {
  if (Boolean(email) !== Boolean(password)) return { error: t('employees.errLoginBoth', lang) }
  if (email && !EMAIL_SHAPE.test(email)) return { error: t('employees.errEmailInvalid', lang) }
  if (email && password.length < 8) return { error: t('employees.errPasswordShort', lang) }
  return {}
}

/** The fixed set an Employee's `category` is locked to (issue #567) — the
 *  canonical English strings, matched against whatever's actually stored
 *  (seed data, and every cross-referencing table: standing_grace_rule_categories,
 *  SMS recipient filters, satisfaction-rating breakdowns) regardless of the
 *  UI's current language. Both entry forms render a `<select>` restricted
 *  to these; this list is what the server checks a submission against so a
 *  direct POST can't smuggle an arbitrary string past the dropdown. */
export const EMPLOYEE_CATEGORIES = [
  'Teacher',
  'Office Staff',
  'Management',
  'Security',
  'Head Teacher',
  'Principal',
  'Vice Principal',
  'Registrar',
  'Office Clerk',
  'Accountant',
  'Professor',
  'Lecturer',
  'Librarian',
  'Nurse',
  'Medical Staff',
  'IT Technician',
  'Janitor',
  'Cleaner',
  'Security Guard',
  'Transport Staff',
] as const

/** The translated label for each fixed category (issue #666) — moved here
 *  from the Add Employee form so Category Grace's own dropdown (which needs
 *  the identical fixed list, issue #666's validation fix) renders the same
 *  labels instead of re-declaring them, the same "one map, several
 *  consumers" pattern as ACADEMIC_SHIFT_LABEL_KEY (lib/institute.ts). */
export const EMPLOYEE_CATEGORY_LABEL_KEY: Record<(typeof EMPLOYEE_CATEGORIES)[number], MessageKey> = {
  Teacher: 'employees.categoryTeacher',
  'Office Staff': 'employees.categoryOfficeStaff',
  Management: 'employees.categoryManagement',
  Security: 'employees.categorySecurity',
  'Head Teacher': 'employees.categoryHeadTeacher',
  Principal: 'employees.categoryPrincipal',
  'Vice Principal': 'employees.categoryVicePrincipal',
  Registrar: 'employees.categoryRegistrar',
  'Office Clerk': 'employees.categoryOfficeClerk',
  Accountant: 'employees.categoryAccountant',
  Professor: 'employees.categoryProfessor',
  Lecturer: 'employees.categoryLecturer',
  Librarian: 'employees.categoryLibrarian',
  Nurse: 'employees.categoryNurse',
  'Medical Staff': 'employees.categoryMedicalStaff',
  'IT Technician': 'employees.categoryItTechnician',
  Janitor: 'employees.categoryJanitor',
  Cleaner: 'employees.categoryCleaner',
  'Security Guard': 'employees.categorySecurityGuard',
  'Transport Staff': 'employees.categoryTransportStaff',
}

/** Whether `category` is one of the fixed list — shared by the validator
 *  below and the edit form's "is this a legacy value?" check, so the
 *  membership test and its `as readonly string[]` cast exist in one place. */
export function isKnownEmployeeCategory(category: string): boolean {
  return (EMPLOYEE_CATEGORIES as readonly string[]).includes(category)
}

/** The translated category label everywhere a category is shown to a user —
 *  the directory list, its record drawer's subtitle, and the drawer's own
 *  profile body (map 013 fix: the profile used to render the raw DB value,
 *  "Teacher" never translated, while the list beside it already was). A
 *  legacy pre-#567 value outside the fixed list (this DB has lowercase
 *  "admin"/"staff"/"teacher" rows) falls back to itself, unchanged. */
export function employeeCategoryLabel(category: string, lang: Lang): string {
  return isKnownEmployeeCategory(category)
    ? t(EMPLOYEE_CATEGORY_LABEL_KEY[category as keyof typeof EMPLOYEE_CATEGORY_LABEL_KEY], lang)
    : category
}

/** Validates the `category` field against the fixed list (issue #567).
 *  Blank/null is always fine — the field stays optional, unchanged from
 *  before this ticket. A value outside the fixed list is only accepted when
 *  it equals `existing` (the employee's own value already in the database):
 *  real rows can predate this ticket or its later expansion (this staging
 *  DB has employees with `category` = "admin"/"staff"/"teacher", all
 *  lowercase, from before the field was locked down), and re-saving an
 *  edit without touching Category must not fail just because the fixed
 *  list doesn't happen to include whatever's already there. */
export function validateEmployeeCategory(
  category: string | null,
  existing: string | null = null,
): { error?: string } {
  if (!category) return {}
  if (isKnownEmployeeCategory(category)) return {}
  if (category === existing) return {}
  return { error: `Category must be one of: ${EMPLOYEE_CATEGORIES.join(', ')}` }
}
