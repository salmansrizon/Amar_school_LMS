import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Seam: Exams II — exam setup deepening, subject-teacher assignment, exam
// routine, and seat-plan assignment (issue #47, PRD §5.5). Builds on the
// Open/Closed exam entity (issue #8, exams.status) and grading_schemes
// (issue #31): exam_subject_teachers / exam_routine_entries / exam_seat_plans
// all carry the same-school tenancy trigger + a Closed-exam write guard, and
// exam_seat_plans additionally enforces room-capacity (DB constraint) and
// duplicate-range / overlap (publish_seat_plan RPC) server-side.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const PASSWORD = 'test-password-123!'

async function signedIn(email: string): Promise<SupabaseClient> {
  const client = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`login failed for ${email}: ${error.message}`)
  return client
}

describe('Exams II — setup, routine, seat plan (issue #47)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let classId: string
  let mainBuildingId: string
  let subjectId: string
  let subject2Id: string
  let teacherId: string
  let foreignTeacherId: string
  let roomBigId: string
  let roomSmallId: string
  let examId: string
  let closedExamId: string

  async function cleanup(client: SupabaseClient) {
    await client.from('exams').delete().like('name', 'ES Test%')
    await client.from('classes').delete().like('name', 'ES Test%')
    await client.from('employees').delete().like('full_name', 'ES Test%')
    await client.from('rooms').delete().like('name', 'ES Test%')
    await client.from('students').delete().like('full_name', 'ES Test%')
  }

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    await cleanup(ownerA)
    await cleanup(ownerB)

    // Rooms belong to a building since issue #93; every school has one.
    mainBuildingId = (
      await ownerA.from('buildings').select('id').eq('name', 'Main Building').single()
    ).data!.id

    classId = (
      await ownerA.from('classes').insert({ name: 'ES Test Class', section: 'A' }).select('id').single()
    ).data!.id
    subjectId = (
      await ownerA
        .from('subjects')
        .insert({ class_id: classId, name: 'ES Test Bangla', theory_marks: 100 })
        .select('id')
        .single()
    ).data!.id
    subject2Id = (
      await ownerA
        .from('subjects')
        .insert({ class_id: classId, name: 'ES Test English', theory_marks: 100 })
        .select('id')
        .single()
    ).data!.id
    teacherId = (
      await ownerA.from('employees').insert({ full_name: 'ES Test Teacher' }).select('id').single()
    ).data!.id
    foreignTeacherId = (
      await ownerB.from('employees').insert({ full_name: 'ES Test Foreign' }).select('id').single()
    ).data!.id
    roomBigId = (
      await ownerA.from('rooms').insert({ building_id: mainBuildingId, name: 'ES Test Room Big', capacity: 40 }).select('id').single()
    ).data!.id
    roomSmallId = (
      await ownerA.from('rooms').insert({ building_id: mainBuildingId, name: 'ES Test Room Small', capacity: 2 }).select('id').single()
    ).data!.id

    await ownerA.from('students').insert([
      { full_name: 'ES Test Student 1', class_name: 'ES Test Class', section: 'A', roll_number: 1 },
      { full_name: 'ES Test Student 2', class_name: 'ES Test Class', section: 'A', roll_number: 2 },
      { full_name: 'ES Test Student 3', class_name: 'ES Test Class', section: 'A', roll_number: 3 },
    ])

    examId = (
      await ownerA
        .from('exams')
        .insert({ name: 'ES Test Exam', exam_year: 2026, class_id: classId, start_date: '2026-12-10' })
        .select('id')
        .single()
    ).data!.id

    closedExamId = (
      await ownerA
        .from('exams')
        .insert({ name: 'ES Test Closed Exam', exam_year: 2026, class_id: classId })
        .select('id')
        .single()
    ).data!.id
    const { error: closeErr } = await ownerA.rpc('close_exam', { exam: closedExamId })
    if (closeErr) throw new Error(`setup: closing exam failed: ${closeErr.message}`)
  })

  afterAll(async () => {
    // Closed exams are undeletable by school roles (issue #8 preserved
    // behaviour) — clean up as Super Admin, who is exempt.
    const admin = await signedIn('super@test.local')
    await admin.from('exams').delete().like('name', 'ES Test%')
    await cleanup(ownerA)
    await cleanup(ownerB)
  })

  it('exam setup: class/start_date/grading_scheme_id save on the exam', async () => {
    const { data, error } = await ownerA
      .from('exams')
      .update({ start_date: '2026-12-11' })
      .eq('id', examId)
      .select('start_date, class_id')
      .single()
    expect(error).toBeNull()
    expect(data!.start_date).toBe('2026-12-11')
    expect(data!.class_id).toBe(classId)
  })

  it("an exam cannot reference another school's class (tenancy trigger)", async () => {
    const { data: foreignClass } = await ownerB
      .from('classes')
      .insert({ name: 'ES Test Foreign Class' })
      .select('id')
      .single()
    const { error } = await ownerA.from('exams').update({ class_id: foreignClass!.id }).eq('id', examId)
    expect(error).not.toBeNull()
    expect(error!.message).toContain('class does not belong to this school')
    await ownerB.from('classes').delete().eq('id', foreignClass!.id)
  })

  it('subject-teacher assignment: assigns a teacher to a subject for the exam', async () => {
    const { data, error } = await ownerA
      .from('exam_subject_teachers')
      .insert({ exam_id: examId, subject_id: subjectId, teacher_id: teacherId })
      .select('id, teacher_id')
      .single()
    expect(error).toBeNull()
    expect(data!.teacher_id).toBe(teacherId)
  })

  it('one assignment row per subject per exam (unique, re-save upserts)', async () => {
    const { error } = await ownerA
      .from('exam_subject_teachers')
      .upsert(
        { exam_id: examId, subject_id: subjectId, teacher_id: teacherId },
        { onConflict: 'exam_id,subject_id' },
      )
    expect(error).toBeNull()
    const { data } = await ownerA
      .from('exam_subject_teachers')
      .select('id')
      .eq('exam_id', examId)
      .eq('subject_id', subjectId)
    expect(data).toHaveLength(1)
  })

  it("cannot assign another school's teacher (tenancy trigger)", async () => {
    const { error } = await ownerA
      .from('exam_subject_teachers')
      .insert({ exam_id: examId, subject_id: subject2Id, teacher_id: foreignTeacherId })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('teacher does not belong to this school')
  })

  it('subject-teacher assignment is rejected once the exam is closed', async () => {
    const { error } = await ownerA
      .from('exam_subject_teachers')
      .insert({ exam_id: closedExamId, subject_id: subjectId, teacher_id: teacherId })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('exam is closed')
  })

  it('exam routine: adds a scheduled sitting for a subject', async () => {
    const { data, error } = await ownerA
      .from('exam_routine_entries')
      .insert({
        exam_id: examId,
        subject_id: subjectId,
        exam_date: '2026-12-10',
        start_time: '10:00',
        end_time: '13:00',
        room_id: roomBigId,
      })
      .select('id')
      .single()
    expect(error).toBeNull()
    expect(data!.id).toBeTruthy()
  })

  it('end_time must be after start_time', async () => {
    const { error } = await ownerA.from('exam_routine_entries').insert({
      exam_id: examId,
      subject_id: subject2Id,
      exam_date: '2026-12-12',
      start_time: '13:00',
      end_time: '10:00',
    })
    expect(error).not.toBeNull()
  })

  it('a subject cannot be scheduled twice for the same exam (unique)', async () => {
    const { error } = await ownerA.from('exam_routine_entries').insert({
      exam_id: examId,
      subject_id: subjectId,
      exam_date: '2026-12-15',
      start_time: '09:00',
      end_time: '11:00',
    })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('23505')
  })

  it('exam routine entries are rejected once the exam is closed', async () => {
    const { error } = await ownerA.from('exam_routine_entries').insert({
      exam_id: closedExamId,
      subject_id: subjectId,
      exam_date: '2026-12-10',
      start_time: '10:00',
      end_time: '11:00',
    })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('exam is closed')
  })

  it('seat plan: a roll range within the room capacity is accepted', async () => {
    const { error } = await ownerA
      .from('exam_seat_plans')
      .insert({ exam_id: examId, room_id: roomBigId, roll_start: 1, roll_end: 2 })
    expect(error).toBeNull()
  })

  it('seat plan: a roll range larger than the room capacity is rejected (server-side)', async () => {
    const { error } = await ownerA
      .from('exam_seat_plans')
      .insert({ exam_id: examId, room_id: roomSmallId, roll_start: 1, roll_end: 5 })
    expect(error).not.toBeNull()
    // Since issue #95 the check sums every exam seated in the room, so the
    // message names the room's budget rather than this one range.
    expect(error!.message).toContain('room capacity exceeded')
  })

  it('seat plan rows are rejected once the exam is closed', async () => {
    const { error } = await ownerA
      .from('exam_seat_plans')
      .insert({ exam_id: closedExamId, room_id: roomBigId, roll_start: 1, roll_end: 2 })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('exam is closed')
  })

  it("RLS: another school's owner sees none of this exam's setup rows", async () => {
    const [{ data: exams }, { data: est }, { data: routine }, { data: seat }] = await Promise.all([
      ownerB.from('exams').select('id').eq('id', examId),
      ownerB.from('exam_subject_teachers').select('id').eq('exam_id', examId),
      ownerB.from('exam_routine_entries').select('id').eq('exam_id', examId),
      ownerB.from('exam_seat_plans').select('id').eq('exam_id', examId),
    ])
    expect(exams).toHaveLength(0)
    expect(est).toHaveLength(0)
    expect(routine).toHaveLength(0)
    expect(seat).toHaveLength(0)
  })

  it('publish_seat_plan rejects when ranges overlap across rooms', async () => {
    // roomBig already has roll 1-2; add an overlapping row on roomSmall.
    const { error: insErr } = await ownerA
      .from('exam_seat_plans')
      .insert({ exam_id: examId, room_id: roomSmallId, roll_start: 2, roll_end: 2 })
    expect(insErr).toBeNull()

    const { error } = await ownerA.rpc('publish_seat_plan', { exam: examId })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('overlap')

    const { data } = await ownerA.from('exams').select('seat_plan_published_at').eq('id', examId).single()
    expect(data!.seat_plan_published_at).toBeNull()
  })

  it('publish_seat_plan succeeds once ranges no longer overlap', async () => {
    const { error: fixErr } = await ownerA
      .from('exam_seat_plans')
      .update({ roll_start: 3, roll_end: 3 })
      .eq('exam_id', examId)
      .eq('room_id', roomSmallId)
    expect(fixErr).toBeNull()

    const { error } = await ownerA.rpc('publish_seat_plan', { exam: examId })
    expect(error).toBeNull()

    const { data } = await ownerA.from('exams').select('seat_plan_published_at').eq('id', examId).single()
    expect(data!.seat_plan_published_at).not.toBeNull()
  })

  it('editing a seat-plan row after publishing clears the publish marker (must re-publish)', async () => {
    // Follows the prior test: examId is published with roomBig 1-2, roomSmall 3.
    const { data: before } = await ownerA
      .from('exams')
      .select('seat_plan_published_at')
      .eq('id', examId)
      .single()
    expect(before!.seat_plan_published_at).not.toBeNull()

    const { error } = await ownerA
      .from('exam_seat_plans')
      .update({ roll_start: 4, roll_end: 4 })
      .eq('exam_id', examId)
      .eq('room_id', roomSmallId)
    expect(error).toBeNull()

    const { data: after } = await ownerA
      .from('exams')
      .select('seat_plan_published_at')
      .eq('id', examId)
      .single()
    expect(after!.seat_plan_published_at).toBeNull()
  })

  it('generate_seat_plan partitions the class roster by roll number into active rooms', async () => {
    // Fresh exam so prior manual rows don't interfere.
    const { data: freshExam } = await ownerA
      .from('exams')
      .insert({ name: 'ES Test Generate Exam', exam_year: 2026, class_id: classId })
      .select('id')
      .single()

    const { error } = await ownerA.rpc('generate_seat_plan', { exam: freshExam!.id })
    expect(error).toBeNull()

    const { data: rows } = await ownerA
      .from('exam_seat_plans')
      .select('room_id, roll_start, roll_end')
      .eq('exam_id', freshExam!.id)
      .order('roll_start')
    // rooms.order('name') puts "ES Test Room Big" (capacity 40) first, so it
    // alone absorbs all 3 rolls; "ES Test Room Small" (capacity 2) gets none.
    expect(rows).toHaveLength(1)
    expect(rows![0].room_id).toBe(roomBigId)
    expect(rows![0].roll_start).toBe(1)
    expect(rows![0].roll_end).toBe(3)

    await ownerA.from('exams').delete().eq('id', freshExam!.id)
  })

  it('generate_seat_plan is idempotent (re-generating replaces, not duplicates)', async () => {
    const { data: freshExam } = await ownerA
      .from('exams')
      .insert({ name: 'ES Test Regenerate Exam', exam_year: 2026, class_id: classId })
      .select('id')
      .single()

    await ownerA.rpc('generate_seat_plan', { exam: freshExam!.id })
    await ownerA.rpc('generate_seat_plan', { exam: freshExam!.id })

    const { data: rows } = await ownerA
      .from('exam_seat_plans')
      .select('id')
      .eq('exam_id', freshExam!.id)
    expect(rows).toHaveLength(1)

    await ownerA.from('exams').delete().eq('id', freshExam!.id)
  })

  it('close is unaffected by the new child tables: closing an exam with setup rows still works', async () => {
    const { data: freshExam } = await ownerA
      .from('exams')
      .insert({ name: 'ES Test Close With Rows', exam_year: 2026, class_id: classId })
      .select('id')
      .single()
    await ownerA
      .from('exam_subject_teachers')
      .insert({ exam_id: freshExam!.id, subject_id: subjectId, teacher_id: teacherId })

    const { error } = await ownerA.rpc('close_exam', { exam: freshExam!.id })
    expect(error).toBeNull()

    // Cleanup as super admin (closed exams are undeletable by school roles).
    const admin = await signedIn('super@test.local')
    await admin.from('exams').delete().eq('id', freshExam!.id)
  })
})
