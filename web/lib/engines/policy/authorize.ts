// Vendor-vs-tenant authorization (map #258, #262): resolves a permission for the
// calling session via the app_has_permission definer RPC, which reads
// role_permissions for the caller's role.
//
// This is NOT the central authorization pipeline the deleted `PolicyEngine`
// interface described, and #514 stopped it claiming to be. Inside a school, the
// authority is RLS plus the screen registry (lib/auth/screens.ts) — see ADR
// 0020. Six permission keys live here, all of them vendor-side.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PermissionKey } from './catalog'

export interface PolicyDecision {
  allowed: boolean
  reason?: string
}

/** Resolve whether the calling session holds a permission. */
export async function authorize(
  client: SupabaseClient,
  permission: PermissionKey,
): Promise<PolicyDecision> {
  const { data, error } = await client.rpc('app_has_permission', { p_permission: permission })
  if (error) return { allowed: false, reason: error.message }
  return { allowed: data === true }
}
