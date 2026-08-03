import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'
import { authorize } from '@/lib/engines/policy/authorize'
import { PERMISSIONS } from '@/lib/engines/policy/catalog'
import { requireSchoolMember, requireSuperAdmin } from '@/lib/auth/require-role'

// Policy Engine (map #258, #262) against live Supabase. Proves the config-driven
// resolver reproduces today's role behavior exactly, that migrated guards match,
// grants are super-admin-only + audited, and RLS protects the config tables.
async function has(client: SupabaseClient, permission: string): Promise<boolean> {
  const { data } = await client.rpc('app_has_permission', { p_permission: permission })
  return data === true
}

describe('Policy Engine (#262)', () => {
  let superClient: SupabaseClient
  let owner: SupabaseClient
  let staff: SupabaseClient

  beforeAll(async () => {
    superClient = await signedIn('super@test.local')
    owner = await signedIn('owner-a@test.local')
    staff = await signedIn('staff-a1@test.local')
  })

  it('resolves permissions per role, mirroring current behavior', async () => {
    expect(await has(superClient, PERMISSIONS.superAdminAccess)).toBe(true)
    expect(await has(superClient, PERMISSIONS.schoolAccess)).toBe(false)

    expect(await has(owner, PERMISSIONS.schoolAccess)).toBe(true)
    expect(await has(owner, PERMISSIONS.instituteManage)).toBe(true)
    expect(await has(owner, PERMISSIONS.superAdminAccess)).toBe(false)

    expect(await has(staff, PERMISSIONS.schoolAccess)).toBe(true)
    expect(await has(staff, PERMISSIONS.instituteManage)).toBe(false)
  })

  it('authorize() wraps the resolver', async () => {
    expect((await authorize(superClient, PERMISSIONS.superAdminAccess)).allowed).toBe(true)
    expect((await authorize(owner, PERMISSIONS.superAdminAccess)).allowed).toBe(false)
  })

  it('migrated guards behave identically to the old role checks', async () => {
    expect(await requireSuperAdmin(superClient)).toBe(true)
    expect(await requireSuperAdmin(owner)).toBe(false)
    expect(await requireSchoolMember(owner)).toBe(true)
    expect(await requireSchoolMember(staff)).toBe(true)
    expect(await requireSchoolMember(superClient)).toBe(false)
  })

  it('set_role_permission grants/revokes (super-admin only) and audits', async () => {
    await superClient.from('permissions').insert({ key: 'test.tmp', description: 'temp' })

    // Non-super cannot grant.
    const denied = await owner.rpc('set_role_permission', {
      p_role_key: 'staff_user',
      p_permission_key: 'test.tmp',
      p_granted: true,
    })
    expect(denied.error).not.toBeNull()

    // Super grants -> staff now holds it.
    await superClient.rpc('set_role_permission', {
      p_role_key: 'staff_user',
      p_permission_key: 'test.tmp',
      p_granted: true,
    })
    expect(await has(staff, 'test.tmp')).toBe(true)

    // Audited.
    const audit = (await superClient
      .from('audit_log')
      .select('action')
      .eq('entity_type', 'role_permission')
      .eq('entity_id', 'staff_user:test.tmp')).data ?? []
    expect(audit.some((r) => r.action === 'create')).toBe(true)

    // Revoke.
    await superClient.rpc('set_role_permission', {
      p_role_key: 'staff_user',
      p_permission_key: 'test.tmp',
      p_granted: false,
    })
    expect(await has(staff, 'test.tmp')).toBe(false)
  })

  it('protects config tables via RLS', async () => {
    // Signed-in users read config; a non-super cannot write role_permissions directly.
    const rows = (await owner.from('roles').select('key')).data ?? []
    expect(rows.length).toBeGreaterThan(0)

    const { error } = await owner
      .from('role_permissions')
      .insert({ role_key: 'staff_user', permission_key: 'super_admin.access' })
    expect(error).not.toBeNull()
  })

  afterAll(async () => {
    // Clean up the temp permission (cascades to any role_permission rows).
    await superClient.from('permissions').delete().eq('key', 'test.tmp')
  })
})
