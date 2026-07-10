import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Seam: Class & Curriculum II schema (issue #45, PRD §5.4 second half) —
// routine_slots (one per class/day/period, School-wide teacher & room
// conflict-free via partial unique indexes, same-school tenancy trigger),
// class_routines publish marker, class_syllabi metadata, all RLS-scoped.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const PASSWORD = 'test-password-123!'

async function signedIn(email: string): Promise<SupabaseClient> {
  const client = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`login failed for ${email}: ${error.message}`)
  return client
}

describe('Class & Curriculum II (issue #45)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let classId: string
  let otherClassId: string
  let subjectId: string
  let teacherId: string
  let roomId: string
  let foreignTeacherId: string

  async function cleanup(client: SupabaseClient) {
    // Class delete cascades to routine_slots / class_routines / class_syllabi.
    await client.from('classes').delete().like('name', 'RT Test%')
    await client.from('employees').delete().like('full_name', 'RT Test%')
    await client.from('rooms').delete().like('name', 'RT Test%')
  }

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    await cleanup(ownerA)
    await cleanup(ownerB)

    const { data: cls, error } = await ownerA
      .from('classes')
      .insert([
        { name: 'RT Test Class', section: 'A' },
        { name: 'RT Test Class', section: 'B' },
      ])
      .select('id')
    if (error) throw new Error(error.message)
    classId = cls![0].id
    otherClassId = cls![1].id

    subjectId = (
      await ownerA
        .from('subjects')
        .insert({ class_id: classId, name: 'RT Test Subject', theory_marks: 100 })
        .select('id')
        .single()
    ).data!.id
    teacherId = (
      await ownerA.from('employees').insert({ full_name: 'RT Test Teacher' }).select('id').single()
    ).data!.id
    roomId = (
      await ownerA.from('rooms').insert({ name: 'RT Test Room', capacity: 40 }).select('id').single()
    ).data!.id
    foreignTeacherId = (
      await ownerB.from('employees').insert({ full_name: 'RT Test Foreign' }).select('id').single()
    ).data!.id
  })

  afterAll(async () => {
    await cleanup(ownerA)
    await cleanup(ownerB)
  })

  it('a slot stores subject, teacher and room for a class/day/period', async () => {
    const { data, error } = await ownerA
      .from('routine_slots')
      .insert({
        class_id: classId,
        day_of_week: 0,
        period: 1,
        subject_id: subjectId,
        teacher_id: teacherId,
        room_id: roomId,
      })
      .select('id, subject_id')
      .single()
    expect(error).toBeNull()
    expect(data?.subject_id).toBe(subjectId)
  })

  it('the same class/day/period upserts in place instead of duplicating', async () => {
    const { error } = await ownerA
      .from('routine_slots')
      .upsert(
        { class_id: classId, day_of_week: 0, period: 1, subject_id: subjectId },
        { onConflict: 'class_id,day_of_week,period' },
      )
    expect(error).toBeNull()
    const { data } = await ownerA
      .from('routine_slots')
      .select('id')
      .eq('class_id', classId)
      .eq('day_of_week', 0)
      .eq('period', 1)
    expect(data).toHaveLength(1)
  })

  it('a teacher cannot be in two places in the same day/period (conflict index)', async () => {
    const { error } = await ownerA.from('routine_slots').insert({
      class_id: otherClassId,
      day_of_week: 0,
      period: 1,
      teacher_id: teacherId,
    })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('23505')
    expect(error!.message).toContain('routine_slots_teacher_conflict')
  })

  it('a room cannot host two classes in the same day/period (conflict index)', async () => {
    const { error } = await ownerA.from('routine_slots').insert({
      class_id: otherClassId,
      day_of_week: 0,
      period: 1,
      room_id: roomId,
    })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('23505')
    expect(error!.message).toContain('routine_slots_room_conflict')
  })

  it('the same teacher and room are fine in a different period', async () => {
    const { error } = await ownerA.from('routine_slots').insert({
      class_id: otherClassId,
      day_of_week: 0,
      period: 2,
      teacher_id: teacherId,
      room_id: roomId,
    })
    expect(error).toBeNull()
  })

  it("a slot cannot be created for another school's class (tenancy trigger)", async () => {
    const { error } = await ownerB.from('routine_slots').insert({
      class_id: classId, // school A's class; ownerB's school_id defaults in
      day_of_week: 1,
      period: 1,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('class does not belong to this school')
  })

  it("a slot cannot reference another school's teacher (tenancy trigger)", async () => {
    const { error } = await ownerA.from('routine_slots').insert({
      class_id: classId,
      day_of_week: 1,
      period: 1,
      teacher_id: foreignTeacherId,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('teacher does not belong to this school')
  })

  it('slot day and period are range-checked', async () => {
    const { error: badDay } = await ownerA
      .from('routine_slots')
      .insert({ class_id: classId, day_of_week: 7, period: 1 })
    expect(badDay).not.toBeNull()
    const { error: badPeriod } = await ownerA
      .from('routine_slots')
      .insert({ class_id: classId, day_of_week: 1, period: 13 })
    expect(badPeriod).not.toBeNull()
  })

  it("RLS: another school's owner sees none of the slots", async () => {
    const { data } = await ownerB.from('routine_slots').select('id').eq('class_id', classId)
    expect(data).toHaveLength(0)
  })

  it('publishing stamps class_routines once per class (upsert)', async () => {
    const publish = () =>
      ownerA
        .from('class_routines')
        .upsert(
          { class_id: classId, published_at: new Date().toISOString() },
          { onConflict: 'class_id' },
        )
    expect((await publish()).error).toBeNull()
    expect((await publish()).error).toBeNull()
    const { data } = await ownerA.from('class_routines').select('published_at').eq('class_id', classId)
    expect(data).toHaveLength(1)
    expect(data![0].published_at).not.toBeNull()
  })

  it("a publish row cannot target another school's class (tenancy trigger)", async () => {
    const { error } = await ownerB
      .from('class_routines')
      .insert({ class_id: classId, published_at: new Date().toISOString() })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('class does not belong to this school')
  })

  it("a syllabus row cannot target another school's class (tenancy trigger)", async () => {
    const { error } = await ownerB.from('class_syllabi').insert({
      class_id: classId,
      storage_path: `ignored/${classId}.pdf`,
      file_name: 'ghost.pdf',
    })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('class does not belong to this school')
  })

  it('one syllabus row per class, replaced on re-upload (upsert)', async () => {
    const row = (name: string, size: number) =>
      ownerA.from('class_syllabi').upsert(
        {
          class_id: classId,
          storage_path: `ignored/${classId}.pdf`,
          file_name: name,
          file_size: size,
          uploaded_at: new Date().toISOString(),
        },
        { onConflict: 'class_id' },
      )
    expect((await row('first.pdf', 1024)).error).toBeNull()
    expect((await row('second.pdf', 2048)).error).toBeNull()
    const { data } = await ownerA
      .from('class_syllabi')
      .select('file_name, file_size')
      .eq('class_id', classId)
    expect(data).toHaveLength(1)
    expect(data![0].file_name).toBe('second.pdf')
    expect(data![0].file_size).toBe(2048)
  })

  it('a zero or negative syllabus file size is rejected', async () => {
    const { error } = await ownerA
      .from('class_syllabi')
      .update({ file_size: 0 })
      .eq('class_id', classId)
    expect(error).not.toBeNull()
  })

  it("RLS: another school's owner sees no syllabus metadata", async () => {
    const { data } = await ownerB.from('class_syllabi').select('class_id').eq('class_id', classId)
    expect(data).toHaveLength(0)
  })
})
