import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'
import { isFeatureEnabled } from '@/lib/engines/feature/engine'

// Feature Engine (map #258, #263) against live Supabase: default-active
// resolution (behavior preservation), per-school override, dependency cascade,
// tenant authorization, RLS, and audited config change.
describe('Feature Engine (#263)', () => {
  let superClient: SupabaseClient
  let owner: SupabaseClient
  let ownerB: SupabaseClient
  let schoolA: string
  let schoolB: string

  beforeAll(async () => {
    superClient = await signedIn('super@test.local')
    owner = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    const a = (await owner.auth.getUser()).data.user!
    const b = (await ownerB.auth.getUser()).data.user!
    schoolA = (await owner.from('profiles').select('school_id').eq('id', a.id).single()).data!.school_id
    schoolB = (await ownerB.from('profiles').select('school_id').eq('id', b.id).single()).data!.school_id
    // Clean any leftovers from a prior run.
    await superClient.from('school_features').delete().eq('school_id', schoolA)
  })

  afterAll(async () => {
    await superClient.from('school_features').delete().eq('school_id', schoolA)
  })

  it('defaults every feature to enabled (preserves "all modules visible")', async () => {
    expect(await isFeatureEnabled(owner, schoolA, 'students')).toBe(true)
    expect(await isFeatureEnabled(owner, schoolA, 'exams')).toBe(true)
    expect(await isFeatureEnabled(owner, schoolA, 'institute')).toBe(true)
  })

  it('honors a per-school disable override and audits it', async () => {
    await superClient.rpc('set_school_feature', {
      p_school: schoolA,
      p_feature: 'notices',
      p_state: 'disabled',
    })
    expect(await isFeatureEnabled(owner, schoolA, 'notices')).toBe(false)

    const audit = (await superClient
      .from('audit_log')
      .select('action')
      .eq('entity_type', 'school_feature')
      .eq('entity_id', `${schoolA}:notices`)).data ?? []
    expect(audit.some((r) => r.action === 'configure')).toBe(true)
  })

  it('cascades dependencies — disabling students disables exams', async () => {
    await superClient.rpc('set_school_feature', {
      p_school: schoolA,
      p_feature: 'students',
      p_state: 'disabled',
    })
    expect(await isFeatureEnabled(owner, schoolA, 'students')).toBe(false)
    expect(await isFeatureEnabled(owner, schoolA, 'exams')).toBe(false) // depends on students

    // Re-enable restores the dependent.
    await superClient.rpc('set_school_feature', {
      p_school: schoolA,
      p_feature: 'students',
      p_state: 'active',
    })
    expect(await isFeatureEnabled(owner, schoolA, 'exams')).toBe(true)
  })

  it('refuses to resolve features for another tenant', async () => {
    const { error } = await owner.rpc('app_feature_enabled', { p_school: schoolB, p_feature: 'students' })
    expect(error).not.toBeNull()
  })

  it('protects school_features from direct non-super writes (RLS)', async () => {
    const { error } = await owner
      .from('school_features')
      .insert({ school_id: schoolA, feature_key: 'sms', state: 'disabled' })
    expect(error).not.toBeNull()
  })
})
