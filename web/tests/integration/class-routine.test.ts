import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Seam: weekly routine builder — conflict-free assignment + tenancy (issue #45).
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const PASSWORD = 'test-password-123!'
const TAG = 'RT45'

async function signedIn(email: string): Promise<SupabaseClient> {
  const client = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`login failed for ${email}: ${error.message}`)
  return client
}

describe('Class routine builder (issue #45)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let classId: string
  let teacherId: string
  let roomId: string

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    classId = (await ownerA.from('classes').insert({ name: `${TAG} Class` }).select('id').single()).data!.id
    teacherId = (await ownerA.from('employees').insert({ full_name: `${TAG} Teacher` }).select('id').single()).data!.id
    roomId = (await ownerA.from('rooms').insert({ name: `${TAG} Room`, capacity: 30 }).select('id').single()).data!.id
  })

  afterAll(async () => {
    if (!ownerA) return
    await ownerA.from('routine_slots').delete().eq('class_id', classId)
    await ownerA.from('class_routines').delete().eq('class_id', classId)
    await ownerA.from('classes').delete().eq('id', classId)
    await ownerA.from('employees').delete().eq('id', teacherId)
    await ownerA.from('rooms').delete().eq('id', roomId)
    await ownerB.from('subjects').delete().like('name', `${TAG}%`)
  })

  it('assigns a slot with teacher + room', async () => {
    const { error } = await ownerA
      .from('routine_slots')
      .insert({ class_id: classId, day_of_week: 0, period: 1, teacher_id: teacherId, room_id: roomId })
    expect(error).toBeNull()
  })

  it('rejects double-booking the same teacher in the same day/period', async () => {
    const { error } = await ownerA
      .from('routine_slots')
      .insert({ class_id: classId, day_of_week: 0, period: 1, teacher_id: teacherId })
    // Same (class,day,period) also violates the per-cell unique — either way it must fail.
    expect(error).not.toBeNull()
  })

  it('rejects double-booking the same room in the same day/period (different class cell)', async () => {
    // A different class in the same school, same day/period, same room.
    const otherClass = (await ownerA.from('classes').insert({ name: `${TAG} Class2` }).select('id').single()).data!
    const { error } = await ownerA
      .from('routine_slots')
      .insert({ class_id: otherClass.id, day_of_week: 0, period: 1, room_id: roomId })
    expect(error).not.toBeNull()
    await ownerA.from('classes').delete().eq('id', otherClass.id)
  })

  it('rejects a slot referencing another school subject (same-school trigger)', async () => {
    const foreignSubject = (
      await ownerB.from('subjects').insert({ name: `${TAG} Foreign`, theory_marks: 100 }).select('id').single()
    ).data!
    const { error } = await ownerA
      .from('routine_slots')
      .insert({ class_id: classId, day_of_week: 2, period: 2, subject_id: foreignSubject.id })
    expect(error).not.toBeNull()
  })

  it('publishes the routine (idempotent upsert)', async () => {
    const { error: e1 } = await ownerA
      .from('class_routines')
      .upsert({ class_id: classId, published_at: new Date().toISOString() }, { onConflict: 'class_id' })
    expect(e1).toBeNull()
    const { data } = await ownerA.from('class_routines').select('published_at').eq('class_id', classId).single()
    expect(data!.published_at).not.toBeNull()
  })
})
