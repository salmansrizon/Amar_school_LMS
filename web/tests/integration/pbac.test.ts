import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'
import { authorizeContext } from '@/lib/engines/policy/pbac'
import { PERMISSIONS } from '@/lib/engines/policy/catalog'

// PBAC (#271): permission AND feature availability.
describe('PBAC authorize (#262 + #263)', () => {
  let superClient: SupabaseClient
  let owner: SupabaseClient
  let schoolA: string

  beforeAll(async () => {
    superClient = await signedIn('super@test.local')
    owner = await signedIn('owner-a@test.local')
    const a = (await owner.auth.getUser()).data.user!
    schoolA = (await owner.from('profiles').select('school_id').eq('id', a.id).single()).data!.school_id
    await superClient.from('school_features').delete().eq('school_id', schoolA)
  })

  afterAll(async () => {
    await superClient.from('school_features').delete().eq('school_id', schoolA)
  })

  it('allows when role grants the permission and the feature is enabled', async () => {
    const d = await authorizeContext(owner, { permission: PERMISSIONS.schoolAccess, schoolId: schoolA, feature: 'sms' })
    expect(d.allowed).toBe(true)
  })

  it('denies when the feature is disabled even though the role permits', async () => {
    await superClient.rpc('set_school_feature', { p_school: schoolA, p_feature: 'sms', p_state: 'disabled' })
    const d = await authorizeContext(owner, { permission: PERMISSIONS.schoolAccess, schoolId: schoolA, feature: 'sms' })
    expect(d.allowed).toBe(false)
  })

  it('denies when the role lacks the permission regardless of feature', async () => {
    const d = await authorizeContext(owner, { permission: PERMISSIONS.superAdminAccess, schoolId: schoolA, feature: 'sms' })
    expect(d.allowed).toBe(false)
  })
})
