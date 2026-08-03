// Policy Engine — SEAM ONLY (map #258, implemented in #262).
// Central authorization pipeline (RBAC + PBAC): auth -> tenant -> role ->
// policy -> feature -> subscription. RLS stays as DB backstop. Config tables
// (roles/permissions/role_permissions/policies) are Super-Admin editable.

export type AppRole =
  | 'school_owner'
  | 'staff_user'
  | 'distributor'
  | 'agent'
  | 'gov_official'
  | 'super_admin'

/** Context assembled per request before business logic runs. */
export interface AuthContext {
  userId: string | null
  role: AppRole | null
  /** Tenant the request targets; null for vendor-side roles. */
  schoolId: string | null
  /** Territory scope for distributor/agent/gov_official. */
  territoryIds: string[]
}

export interface PolicyDecision {
  allowed: boolean
  reason?: string
}

export interface PolicyEngine {
  /** Resolve a full allow/deny decision for a permission in a context. */
  authorize(ctx: AuthContext, permission: string): Promise<PolicyDecision>
}
