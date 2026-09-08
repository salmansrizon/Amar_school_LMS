import { describe, it, expect, beforeAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'
import { PUBLICATION_TARGET_SCENARIOS } from '@/lib/publishing-targeting-scenarios'

// issue #595, map #598 Wave 1 (#602). Three concerns:
//  1. publication_target_matches_offering (SQL) agrees with targetMatchesOffering
//     (TS, tests/unit/publishing-targeting.test.ts) on every row of the same
//     shared scenario table -- the parity proof the whole shared-primitive
//     design depends on.
//  2. publications_target_scope_valid rejects every malformed all/offering/
//     broadcast combination, and exempts a not-yet-migrated (target_scope
//     null) row -- the additive "expand phase" contract.
//  3. The one-time backfill actually produced what #600's resolution said it
//     would, against the two real rows this was grilled against.
describe('publication_target_matches_offering (#595, #602)', () => {
  let owner: SupabaseClient

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
  })

  for (const scenario of PUBLICATION_TARGET_SCENARIOS) {
    it(`SQL agrees with TS: ${scenario.description}`, async () => {
      const { data, error } = await owner.rpc('publication_target_matches_offering', {
        p_target_scope: scenario.target.scope,
        p_target_class_offering_id: scenario.target.classOfferingId,
        p_target_class_name: scenario.target.className,
        p_target_academic_year: scenario.target.academicYear,
        p_target_shift: scenario.target.shift,
        p_target_group_department: scenario.target.groupDepartment,
        p_target_section: scenario.target.section,
        p_offering_id: scenario.offering.id,
        p_offering_name: scenario.offering.name,
        p_offering_academic_year: scenario.offering.academicYear,
        p_offering_shift: scenario.offering.shift,
        p_offering_group_department: scenario.offering.groupDepartment,
        p_offering_section: scenario.offering.section,
      })
      expect(error).toBeNull()
      expect(data).toBe(scenario.expected)
    })
  }
})

describe('publications_target_scope_valid (#595, #602)', () => {
  let owner: SupabaseClient
  const TAG = 'W595 targeting-check'

  async function cleanup() {
    await owner.from('publications').delete().eq('title', TAG)
  }

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    await cleanup()
  })

  const base = {
    kind: 'notice' as const,
    title: TAG,
    importance: 'normal' as const,
  }

  it('accepts a null target_scope row unchanged (backward compatibility with not-yet-migrated writers)', async () => {
    const { error } = await owner.from('publications').insert({ ...base, target_type: 'all' })
    expect(error).toBeNull()
    await cleanup()
  })

  it("rejects scope='all' with any target field set", async () => {
    const { error } = await owner
      .from('publications')
      .insert({ ...base, target_type: 'all', target_scope: 'all', target_class_name: 'Nine' })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('23514')
  })

  it("allows scope='offering' with a null class_offering_id -- the deliberate post-deletion state (#603), not a violation", async () => {
    // Not required at the DB layer (that's an application-layer compose-time
    // concern, #607) precisely because ON DELETE SET NULL must be able to
    // produce this exact row shape when a targeted Offering is deleted
    // (#599) -- a CHECK that rejected it would turn every such deletion into
    // a foreign-key failure. Proven end-to-end in student-matches-target.test.ts.
    const { error } = await owner.from('publications').insert({ ...base, target_type: 'specific', target_scope: 'offering' })
    expect(error).toBeNull()
    await cleanup()
  })

  it("rejects scope='offering' with predicate fields also set", async () => {
    const { data: offering } = await owner.from('class_offerings').select('id').limit(1).single()
    const { error } = await owner.from('publications').insert({
      ...base,
      target_type: 'specific',
      target_scope: 'offering',
      class_offering_id: offering!.id,
      target_class_name: 'Nine',
    })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('23514')
  })

  it("accepts a well-formed scope='offering' row", async () => {
    const { data: offering } = await owner.from('class_offerings').select('id').limit(1).single()
    const { error } = await owner
      .from('publications')
      .insert({ ...base, target_type: 'specific', target_scope: 'offering', class_offering_id: offering!.id })
    expect(error).toBeNull()
    await cleanup()
  })

  it("rejects scope='broadcast' without a Class name", async () => {
    const { error } = await owner
      .from('publications')
      .insert({ ...base, target_type: 'specific', target_scope: 'broadcast', target_academic_year: 2026 })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('23514')
  })

  it("rejects scope='broadcast' without an Academic Year", async () => {
    const { error } = await owner
      .from('publications')
      .insert({ ...base, target_type: 'specific', target_scope: 'broadcast', target_class_name: 'Nine' })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('23514')
  })

  it("accepts a well-formed scope='broadcast' row with every predicate field Any", async () => {
    const { error } = await owner
      .from('publications')
      .insert({ ...base, target_type: 'specific', target_scope: 'broadcast', target_class_name: 'Nine', target_academic_year: 2026 })
    expect(error).toBeNull()
    await cleanup()
  })

  it('rejects an invalid target_shift value', async () => {
    const { error } = await owner.from('publications').insert({
      ...base,
      target_type: 'specific',
      target_scope: 'broadcast',
      target_class_name: 'Nine',
      target_academic_year: 2026,
      target_shift: 'Midnight',
    })
    expect(error).not.toBeNull()
  })
})

describe('Wave 1 backfill of the two known legacy rows (#600)', () => {
  let owner: SupabaseClient

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
  })

  it('the resolvable legacy row (E2E seed homework) backfilled to a broadcast target preserving its recorded Section', async () => {
    const { data } = await owner
      .from('publications')
      .select('target_scope, target_class_name, target_academic_year, target_shift, target_group_department, target_section')
      .eq('id', '3370e0d0-50fd-48b2-923d-14d8283dfe9a')
      .maybeSingle()
    if (!data) return // seed not present in this environment -- nothing to assert
    expect(data.target_scope).toBe('broadcast')
    expect(data.target_class_name).toBe('Seed Class')
    expect(data.target_section).toBe('A')
    expect(data.target_shift).toBeNull()
    expect(data.target_group_department).toBeNull()
    expect(data.target_academic_year).toBe(2026)
  })

  it('the unresolvable legacy demo row was deleted, not fabricated into a target', async () => {
    const { data } = await owner.from('publications').select('id').eq('id', 'db5c1e31-621e-492f-baae-f5fe90bf7e02').maybeSingle()
    expect(data).toBeNull()
  })

  it('zero rows anywhere are left with target_type=specific and no target_scope backfilled', async () => {
    const { data } = await owner.from('publications').select('id').eq('target_type', 'specific').is('target_scope', null)
    expect(data ?? []).toEqual([])
  })
})
