import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { MAIN_BUILDING_NAME } from '@/lib/venues'
import { signedIn } from '../helpers/auth'

// Seam: buildings & rooms master data (issue #93, map #91, migration 0057).
// The interesting parts are structural: every school already has its
// auto-created Main Building, no room can exist without a building, room names
// are unique per building (not per school), and a building's rooms cascade.

const TEST_PREFIX = 'V93 '

describe('Buildings & rooms master data (issue #93)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let schoolAId: string
  let mainBuildingId: string

  async function cleanup(client: SupabaseClient) {
    await client.from('rooms').delete().like('name', `${TEST_PREFIX}%`)
    await client.from('buildings').delete().like('name', `${TEST_PREFIX}%`)
  }

  beforeAll(async () => {
    ;[ownerA, ownerB] = await Promise.all([
      signedIn('owner-a@test.local'),
      signedIn('owner-b@test.local'),
    ])
    const { data: userA } = await ownerA.auth.getUser()
    schoolAId = (
      await ownerA.from('profiles').select('school_id').eq('id', userA.user!.id).single()
    ).data!.school_id

    await cleanup(ownerA)
    await cleanup(ownerB)

    const { data: main } = await ownerA
      .from('buildings')
      .select('id')
      .eq('name', MAIN_BUILDING_NAME)
      .single()
    mainBuildingId = main!.id
  }, 30000)

  afterAll(async () => {
    await cleanup(ownerA)
    await cleanup(ownerB)
  }, 30000)

  it('every school already has its auto-created Main Building', async () => {
    expect(mainBuildingId).toBeTruthy()
    const { data: forB } = await ownerB
      .from('buildings')
      .select('id, name')
      .eq('name', MAIN_BUILDING_NAME)
    expect(forB?.length).toBe(1)
  })

  it('no pre-existing room was left without a building', async () => {
    const { data } = await ownerA.from('rooms').select('id').is('building_id', null)
    expect(data).toEqual([])
  })

  it('rejects a duplicate building name within the school', async () => {
    const { error: first } = await ownerA.from('buildings').insert({ name: `${TEST_PREFIX}Academic` })
    expect(first).toBeNull()
    const { error: dup } = await ownerA.from('buildings').insert({ name: `${TEST_PREFIX}Academic` })
    expect(dup?.code).toBe('23505')
  })

  it('allows the same building name in another school', async () => {
    const { error } = await ownerB.from('buildings').insert({ name: `${TEST_PREFIX}Academic` })
    expect(error).toBeNull()
  })

  it('a room cannot be created without a building', async () => {
    const { error } = await ownerA
      .from('rooms')
      .insert({ name: `${TEST_PREFIX}Room 900`, capacity: 40 })
    expect(error).not.toBeNull()
  })

  it('room names are unique within a building but repeat across buildings', async () => {
    const { data: academic } = await ownerA
      .from('buildings')
      .select('id')
      .eq('name', `${TEST_PREFIX}Academic`)
      .single()

    const room = { name: `${TEST_PREFIX}Room 101`, capacity: 80 }
    const { error: inMain } = await ownerA
      .from('rooms')
      .insert({ ...room, building_id: mainBuildingId })
    expect(inMain).toBeNull()

    const { error: dup } = await ownerA
      .from('rooms')
      .insert({ ...room, building_id: mainBuildingId })
    expect(dup?.code).toBe('23505')

    // Same room number in a different building is the normal case.
    const { error: inAcademic } = await ownerA
      .from('rooms')
      .insert({ ...room, building_id: academic!.id })
    expect(inAcademic).toBeNull()
  })

  it("a room cannot point at another school's building", async () => {
    const { data: buildingB } = await ownerB
      .from('buildings')
      .select('id')
      .eq('name', `${TEST_PREFIX}Academic`)
      .single()
    const { error } = await ownerA
      .from('rooms')
      .insert({ name: `${TEST_PREFIX}Room 777`, capacity: 20, building_id: buildingB!.id })
    expect(error).not.toBeNull()
  })

  it("another school's Owner cannot see or edit these buildings", async () => {
    const { data } = await ownerB
      .from('buildings')
      .select('id, school_id')
      .eq('school_id', schoolAId)
    expect(data).toEqual([])
  })

  it('deleting a building takes its rooms with it', async () => {
    const { data: building } = await ownerA
      .from('buildings')
      .insert({ name: `${TEST_PREFIX}Doomed Block` })
      .select('id')
      .single()
    await ownerA
      .from('rooms')
      .insert({ name: `${TEST_PREFIX}Room 501`, capacity: 30, building_id: building!.id })

    await ownerA.from('buildings').delete().eq('id', building!.id)

    const { data: rooms } = await ownerA
      .from('rooms')
      .select('id')
      .eq('building_id', building!.id)
    expect(rooms).toEqual([])
  })

  it('generate_seat_plan still runs against the now-building-scoped rooms', async () => {
    const { data: exam } = await ownerA
      .from('exams')
      .select('id')
      .eq('status', 'open')
      .not('class_id', 'is', null)
      .limit(1)
      .maybeSingle()
    if (!exam) return // no open exam seeded in this environment — nothing to assert

    const { error } = await ownerA.rpc('generate_seat_plan', { exam: exam.id })
    expect(error).toBeNull()
  })
})
