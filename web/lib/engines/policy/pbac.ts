// PBAC extension of the Policy engine (map #258, #262/#271). Combines an RBAC
// permission with the tenant's feature availability (subscription-driven), so a
// single call answers "may this caller do X, given its role AND its features".
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PolicyDecision } from './index'
import type { PermissionKey } from './catalog'

export async function authorizeContext(
  client: SupabaseClient,
  input: { permission: PermissionKey; schoolId?: string | null; feature?: string },
): Promise<PolicyDecision> {
  const { data, error } = await client.rpc('app_authorize', {
    p_permission: input.permission,
    p_school: input.schoolId ?? null,
    p_feature: input.feature ?? null,
  })
  if (error) return { allowed: false, reason: error.message }
  return { allowed: data === true }
}
