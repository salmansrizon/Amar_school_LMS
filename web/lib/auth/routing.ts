export type Role = 'school_owner' | 'staff_user' | 'dealer' | 'super_admin' | 'gov_official'

// Route group per role (ADR 0003: one app, role-based routing).
const ROLE_HOME: Record<Role, string> = {
  school_owner: '/school',
  staff_user: '/school',
  dealer: '/dealer',
  super_admin: '/super-admin',
  gov_official: '/gov',
}

const PROTECTED_GROUPS = ['/school', '/dealer', '/super-admin', '/gov']

function groupOf(pathname: string): string | undefined {
  return PROTECTED_GROUPS.find((g) => pathname === g || pathname.startsWith(g + '/'))
}

export function homeFor(role: Role): string {
  return ROLE_HOME[role]
}

export function isProtectedPath(pathname: string): boolean {
  return groupOf(pathname) !== undefined
}

export function canAccess(role: Role, pathname: string): boolean {
  const group = groupOf(pathname)
  if (!group) return true
  return ROLE_HOME[role] === group
}
