import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn, PASSWORD } from '../helpers/auth'

// Seam: territory_assignments + my_territory_schools + schools RLS for
// territory roles (issue #4).
const DEALER_EMAIL = 'dealer-1@test.local'

describe('Dealer & Government Official Territory assignment (issue #4)', () => {
  let admin: SupabaseClient
  let dealer: SupabaseClient
  let dealerId: string
  let division: string, district: string, upazila: string, union1: string
  let schoolAId: string, schoolBId: string

  beforeAll(async () => {
    admin = await signedIn('super@test.local')
    await admin.from('locations').delete().eq('name', 'T4-Division')

    const add = async (name: string, type: string, parent: string | null) =>
      (await admin.from('locations').insert({ name, type, parent_id: parent }).select('id').single())
        .data!.id as string
    division = await add('T4-Division', 'division', null)
    district = await add('T4-District', 'district', division)
    upazila = await add('T4-Upazila', 'upazila', district)
    union1 = await add('T4-Union', 'union', upazila)

    const { data: schools } = await admin.from('schools').select('id, name').in('name', ['Test School A', 'Test School B'])
    const schoolA = schools?.find((s) => s.name === 'Test School A')
    const schoolB = schools?.find((s) => s.name === 'Test School B')
    if (!schoolA || !schoolB) throw new Error('seed schools missing — run supabase/seed-test.sql first')
    schoolAId = schoolA.id
    schoolBId = schoolB.id
    await admin.from('schools').update({ location_id: union1 }).eq('id', schoolAId)
    await admin.from('schools').update({ location_id: null }).eq('id', schoolBId)

    const { data: created, error } = await admin.rpc('create_vendor_user', {
      user_email: DEALER_EMAIL,
      user_password: PASSWORD,
      user_full_name: 'Test Dealer One',
      user_role: 'dealer',
    })
    if (error) {
      // Already created in a prior run — resolve the SAME account by its name,
      // so dealerId matches the credentials used for the signed-in client.
      const { data: existing } = await admin
        .from('profiles')
        .select('id')
        .eq('role', 'dealer')
        .eq('full_name', 'Test Dealer One')
        .single()
      if (!existing) throw new Error(`dealer exists but profile not found: ${error.message}`)
      dealerId = existing.id
    } else {
      dealerId = created as string
    }
    await admin.from('territory_assignments').delete().eq('assignee_id', dealerId)
    dealer = await signedIn(DEALER_EMAIL)
  })

  afterAll(async () => {
    await admin.from('territory_assignments').delete().eq('assignee_id', dealerId)
    await admin.from('schools').update({ location_id: null }).eq('id', schoolAId)
    await admin.from('locations').delete().eq('id', division)
  })

  it('a Dealer can hold multiple assignments at different tiers simultaneously', async () => {
    const { error: e1 } = await admin.from('territory_assignments').insert({
      assignee_id: dealerId, location_id: district, tier: 'zilla',
    })
    expect(e1).toBeNull()
    const { error: e2 } = await admin.from('territory_assignments').insert({
      assignee_id: dealerId, location_id: union1, tier: 'union',
    })
    expect(e2).toBeNull()

    const { data } = await admin.from('territory_assignments').select('tier').eq('assignee_id', dealerId)
    expect(data!.map((r) => r.tier).sort()).toEqual(['union', 'zilla'])
  })

  it('an assignment must point at exactly one of location or school', async () => {
    const { error: both } = await admin.from('territory_assignments').insert({
      assignee_id: dealerId, location_id: district, school_id: schoolBId,
    })
    expect(both).not.toBeNull()
    const { error: neither } = await admin.from('territory_assignments').insert({
      assignee_id: dealerId,
    })
    expect(neither).not.toBeNull()
  })

  it('the Schools list aggregates all assignments, deduplicated, with extended flag', async () => {
    // Extended (school-scoped) grant on School B, which is outside every location assignment.
    await admin.from('territory_assignments').insert({ assignee_id: dealerId, school_id: schoolBId })

    const { data, error } = await dealer.rpc('my_territory_schools')
    expect(error).toBeNull()
    const rows = data as { school_id: string; is_extended: boolean }[]
    // School A reachable via BOTH district and union assignments → exactly once.
    expect(rows.filter((r) => r.school_id === schoolAId)).toHaveLength(1)
    expect(rows.find((r) => r.school_id === schoolAId)!.is_extended).toBe(false)
    expect(rows.find((r) => r.school_id === schoolBId)!.is_extended).toBe(true)
  })

  it('RLS lets the Dealer read exactly the reachable Schools', async () => {
    const { data } = await dealer.from('schools').select('id')
    expect(data!.map((s) => s.id).sort()).toEqual([schoolAId, schoolBId].sort())
  })

  it('removing one assignment does not affect the others', async () => {
    await admin
      .from('territory_assignments')
      .delete()
      .eq('assignee_id', dealerId)
      .eq('location_id', district)

    const { data } = await dealer.rpc('my_territory_schools')
    const rows = data as { school_id: string }[]
    // Still reachable: A via the union assignment, B via extended.
    expect(rows.map((r) => r.school_id).sort()).toEqual([schoolAId, schoolBId].sort())
  })

  it('a Dealer cannot write territory_assignments', async () => {
    const { error } = await dealer.from('territory_assignments').insert({
      assignee_id: dealerId, location_id: division,
    })
    expect(error).not.toBeNull()
  })

  it('tier is rejected on Government Official assignments', async () => {
    const { data: gov, error: govErr } = await admin.rpc('create_vendor_user', {
      user_email: 'gov-1@test.local',
      user_password: PASSWORD,
      user_full_name: 'Test Gov Official',
      user_role: 'gov_official',
    })
    const govId = govErr
      ? (
          await admin
            .from('profiles')
            .select('id')
            .eq('role', 'gov_official')
            .eq('full_name', 'Test Gov Official')
            .single()
        ).data!.id
      : (gov as string)

    const { error } = await admin.from('territory_assignments').insert({
      assignee_id: govId, location_id: division, tier: 'zilla',
    })
    expect(error).not.toBeNull()
    await admin.from('territory_assignments').delete().eq('assignee_id', govId)
  })
})
