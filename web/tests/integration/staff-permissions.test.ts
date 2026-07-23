import { describe, it, expect, beforeAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn, PASSWORD } from '../helpers/auth'

// Seam: staff_permissions table RLS + create_staff_user RPC (issue #2).
const STAFF_EMAIL = 'staff-a1@test.local'

describe('Staff Permission Grant (issue #2)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let staffId: string

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')

    // Owner A creates (or finds) their staff user via the RPC.
    const { data, error } = await ownerA.rpc('create_staff_user', {
      staff_email: STAFF_EMAIL,
      staff_password: PASSWORD,
      staff_full_name: 'Test Staff A1',
    })
    if (error) {
      const { data: existing } = await ownerA
        .from('profiles')
        .select('id')
        .eq('role', 'staff_user')
        .limit(1)
      staffId = existing![0].id
    } else {
      staffId = data as string
    }
    // Reset grants for a deterministic run.
    await ownerA.from('staff_permissions').delete().eq('staff_user_id', staffId)
  })

  it('created staff user can log in and sees their own school-scoped profile', async () => {
    const staff = await signedIn(STAFF_EMAIL)
    const { data } = await staff.from('profiles').select('role, school_id').eq('id', staffId)
    expect(data![0].role).toBe('staff_user')
    expect(data![0].school_id).not.toBeNull()
  })

  it('School Owner can grant and revoke a screen for their Staff User', async () => {
    const { error: grantErr } = await ownerA
      .from('staff_permissions')
      .insert({ staff_user_id: staffId, screen_key: 'students' })
    expect(grantErr).toBeNull()

    const { data } = await ownerA.from('staff_permissions').select('screen_key').eq('staff_user_id', staffId)
    expect(data!.map((r) => r.screen_key)).toContain('students')

    const { error: revokeErr } = await ownerA
      .from('staff_permissions')
      .delete()
      .eq('staff_user_id', staffId)
      .eq('screen_key', 'students')
    expect(revokeErr).toBeNull()
  })

  it('a Staff User cannot grant themselves permissions', async () => {
    const staff = await signedIn(STAFF_EMAIL)
    const { error } = await staff
      .from('staff_permissions')
      .insert({ staff_user_id: staffId, screen_key: 'fees' })
    expect(error).not.toBeNull()
  })

  it("another School's Owner can neither see nor grant this staff's permissions", async () => {
    await ownerA.from('staff_permissions').insert({ staff_user_id: staffId, screen_key: 'exams' })

    const { data: visible } = await ownerB
      .from('staff_permissions')
      .select('screen_key')
      .eq('staff_user_id', staffId)
    expect(visible).toEqual([])

    const { error } = await ownerB
      .from('staff_permissions')
      .insert({ staff_user_id: staffId, screen_key: 'sms' })
    expect(error).not.toBeNull()

    await ownerA.from('staff_permissions').delete().eq('staff_user_id', staffId)
  })

  it('a Staff User cannot call create_staff_user', async () => {
    const staff = await signedIn(STAFF_EMAIL)
    const { error } = await staff.rpc('create_staff_user', {
      staff_email: 'intruder@test.local',
      staff_password: PASSWORD,
      staff_full_name: 'Intruder',
    })
    expect(error).not.toBeNull()
  })
})
