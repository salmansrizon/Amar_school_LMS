// Permission catalog (map #258, #262) — the typed keys seeded in
// 0080_policy_engine.sql. Code references these constants, never string
// literals, so a typo is a compile error and the catalog has one home.
export const PERMISSIONS = {
  superAdminAccess: 'super_admin.access',
  distributorAccess: 'distributor.access',
  govAccess: 'gov.access',
  schoolAccess: 'school.access',
  schoolOwner: 'school.owner',
  instituteManage: 'institute.manage',
} as const

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]
