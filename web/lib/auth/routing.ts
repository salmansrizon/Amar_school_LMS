export type Role =
  | 'school_owner'
  | 'staff_user'
  | 'distributor'
  | 'agent'
  | 'super_admin'
  | 'gov_official'
  | 'student'

// Route group per role (ADR 0003: one app, role-based routing).
const ROLE_HOME: Record<Role, string> = {
  school_owner: '/school',
  staff_user: '/school',
  distributor: '/distributor',
  agent: '/agent',
  super_admin: '/super-admin',
  gov_official: '/gov',
  student: '/student',
}

const PROTECTED_GROUPS = ['/school', '/student', '/distributor', '/agent', '/super-admin', '/gov']

/** Whole-segment prefix match, so /distributorship is not inside /distributor.
 *  Shared with tenant-routing so the two group lists can't drift on matching. */
export function pathInGroup(pathname: string, group: string): boolean {
  return pathname === group || pathname.startsWith(group + '/')
}

function groupOf(pathname: string): string | undefined {
  return PROTECTED_GROUPS.find((g) => pathInGroup(pathname, g))
}

export function homeFor(role: Role): string {
  return ROLE_HOME[role]
}

/** The roles that belong to a School — the /school group plus the Student
 *  portal (#441). One predicate so the login gate (proxy + login form) can't
 *  drift as roles change: a suspended school locks out its students too.
 *
 *  Not the same question as require-role.ts's `isSchoolMember`, which asks
 *  "may this caller act on school records?" and correctly excludes Students.
 *  Named apart on purpose — the two must never be swapped for each other. */
export function isSchoolScopedRole(role: string | null | undefined): boolean {
  return role === 'school_owner' || role === 'staff_user' || role === 'student'
}

export function isProtectedPath(pathname: string): boolean {
  return groupOf(pathname) !== undefined
}

export function canAccess(role: Role, pathname: string): boolean {
  const group = groupOf(pathname)
  if (!group) return true
  return ROLE_HOME[role] === group
}
