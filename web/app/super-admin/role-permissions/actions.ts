'use server'

import { revalidatePath } from 'next/cache'
import { getSuperAdminContext } from '@/lib/super-admin/context'

// Grant/revoke a role permission (#295). The audited set_role_permission RPC is
// the single writer (upsert/delete + record_audit); this action is the thin
// bridge. RLS/RPC enforce super-admin.
export async function setRolePermission(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getSuperAdminContext()
  const roleKey = String(formData.get('role_key') ?? '')
  const permissionKey = String(formData.get('permission_key') ?? '')
  const granted = String(formData.get('granted') ?? '') === 'true'
  if (!roleKey || !permissionKey) return { error: 'Missing role or permission.' }

  const { error } = await supabase.rpc('set_role_permission', {
    p_role_key: roleKey,
    p_permission_key: permissionKey,
    p_granted: granted,
  })
  if (error) return { error: error.message }
  revalidatePath('/super-admin/role-permissions')
  return {}
}
