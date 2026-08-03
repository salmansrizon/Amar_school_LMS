import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'
import { loadEnabledFeatures } from '@/lib/engines/feature/engine'

// Feature-gating enforcement layer (#271): one round-trip resolves the enabled
// feature set for a school, ready to filter the nav/menu.
describe('school_enabled_features (#263 gating)', () => {
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

  it('returns all features by default (behavior-preserving)', async () => {
    const enabled = await loadEnabledFeatures(owner, schoolA)
    for (const f of ['students', 'exams', 'fees', 'sms', 'institute']) {
      expect(enabled.has(f)).toBe(true)
    }
  })

  it('excludes a feature a Super Admin disables', async () => {
    await superClient.rpc('set_school_feature', { p_school: schoolA, p_feature: 'sms', p_state: 'disabled' })
    const enabled = await loadEnabledFeatures(owner, schoolA)
    expect(enabled.has('sms')).toBe(false)
    expect(enabled.has('students')).toBe(true)
  })
})
