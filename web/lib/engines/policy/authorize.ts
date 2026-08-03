// Policy Engine resolver (map #258, #262). The single app-layer authorization
// entry point: resolves a permission for the calling session via the
// app_has_permission definer RPC (which reads role_permissions for the caller's
// role). RLS remains the DB backstop; this gives modules a clean allow/deny
// without duplicating role logic.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PolicyDecision } from './index'
import type { PermissionKey } from './catalog'

/** Resolve whether the calling session holds a permission. */
export async function authorize(
  client: SupabaseClient,
  permission: PermissionKey,
): Promise<PolicyDecision> {
  const { data, error } = await client.rpc('app_has_permission', { p_permission: permission })
  if (error) return { allowed: false, reason: error.message }
  return { allowed: data === true }
}
