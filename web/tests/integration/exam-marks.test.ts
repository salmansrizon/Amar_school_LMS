import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Seam: Exams III — marks entry, multi-exam combination, promotion/roll-
// transfer (issue #32, PRD §5.5). exam_marks extends the same-school +
// Closed-exam guard pattern the #47 child tables already use (migration
// 0041); exam_combinations/exam_combination_members add the "at most one
// blank weight" / "weights <= 100%" invariants (migration 0042);
// transfer_student gains an optional p_new_roll for promotion (migration
// 0041) without breaking its existing callers.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const PASSWORD = 'test-password-123!'

async function signedIn(email: string): Promise<SupabaseClient> {
  const client = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`login failed for ${email}: ${error.message}`)
  return client
}

describe('Exams III — marks entry, combinations, promotion (issue #32)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let classId: string
  let subjectId: string
  let studentId: string
  let foreignStudentId: string
  let examId: string
  let closedExamId: string
  let secondExamId: string

  async function cleanup(client: SupabaseClient) {
    await client.from('exam_combinations').delete().like('name', 'EM Test%')
    await client.from('exams').delete().like('name', 'EM Test%')
    await client.from('classes').delete().like('name', 'EM Test%')
    await client.from('students').delete().like('full_name', 'EM Test%')
  }

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    await cleanup(ownerA)
    await cleanup(ownerB)

    classId = (
      await ownerA.from('classes').insert({ name: 'EM Test Class', section: 'A' }).select('id').single()
    ).data!.id
    subjectId = (
      await ownerA
        .from('subjects')
        .insert({ class_id: classId, name: 'EM Test Subject', theory_marks: 100 })
        .select('id')
        .single()
    ).data!.id
    studentId = (
      await ownerA
        .from('students')
        .insert({ full_name: 'EM Test Student', class_name: 'EM Test Class', section: 'A', roll_number: 1 })
        .select('id')
        .single()
    ).data!.id
    foreignStudentId = (
      await ownerB.from('students').insert({ full_name: 'EM Test Foreign Student' }).select('id').single()
    ).data!.id

    examId = (
      await ownerA
        .from('exams')
        .insert({ name: 'EM Test Exam', exam_year: 2026, class_id: classId })
        .select('id')
        .single()
    ).data!.id
    secondExamId = (
      await ownerA
        .from('exams')
        .insert({ name: 'EM Test Exam 2', exam_year: 2026, class_id: classId })
        .select('id')
        .single()
    ).data!.id
    closedExamId = (
      await ownerA
        .from('exams')
        .insert({ name: 'EM Test Closed Exam', exam_year: 2026, class_id: classId })
        .select('id')
        .single()
    ).data!.id
    const { error: closeErr } = await ownerA.rpc('close_exam', { exam: closedExamId })
    if (closeErr) throw new Error(`setup: closing exam failed: ${closeErr.message}`)
  })

  afterAll(async () => {
    // Closed exams are undeletable by school roles — clean up as Super Admin.
    const admin = await signedIn('super@test.local')
    await admin.from('exams').delete().like('name', 'EM Test%')
    await cleanup(ownerA)
    await cleanup(ownerB)
  })

  it('marks entry: saves theory/mcq/practical and the total is server-computed', async () => {
    const { data, error } = await ownerA
      .from('exam_marks')
      .insert({ exam_id: examId, student_id: studentId, subject_id: subjectId, theory_obtained: 80 })
      .select('obtained_marks')
      .single()
    expect(error).toBeNull()
    expect(Number(data!.obtained_marks)).toBe(80)
  })

  it('one mark row per (exam, student, subject); re-save upserts', async () => {
    const { error } = await ownerA
      .from('exam_marks')
      .upsert(
        { exam_id: examId, student_id: studentId, subject_id: subjectId, theory_obtained: 90 },
        { onConflict: 'exam_id,student_id,subject_id' },
      )
    expect(error).toBeNull()
    const { data } = await ownerA
      .from('exam_marks')
      .select('id, obtained_marks')
      .eq('exam_id', examId)
      .eq('student_id', studentId)
      .eq('subject_id', subjectId)
    expect(data).toHaveLength(1)
    expect(Number(data![0].obtained_marks)).toBe(90)
  })

  it("cannot enter marks for another school's student (tenancy trigger)", async () => {
    const { error } = await ownerA
      .from('exam_marks')
      .insert({ exam_id: examId, student_id: foreignStudentId, subject_id: subjectId, theory_obtained: 50 })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('student does not belong to this school')
  })

  it('marks entry is rejected once the exam is closed', async () => {
    const { error } = await ownerA
      .from('exam_marks')
      .insert({ exam_id: closedExamId, student_id: studentId, subject_id: subjectId, theory_obtained: 50 })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('exam is closed')
  })

  it("RLS: another school's owner sees none of this exam's marks", async () => {
    const { data } = await ownerB.from('exam_marks').select('id').eq('exam_id', examId)
    expect(data).toHaveLength(0)
  })

  it('transfer_student promotion: an explicit p_new_roll sets the roll directly on a class change', async () => {
    const { error } = await ownerA.rpc('transfer_student', {
      p_student_id: studentId,
      p_to_class: 'EM Test Class Promoted',
      p_to_section: 'B',
      p_to_shift_id: null,
      p_note: 'Promotion',
      p_new_roll: 7,
    })
    expect(error).toBeNull()
    const { data } = await ownerA.from('students').select('class_name, section, roll_number').eq('id', studentId).single()
    expect(data!.class_name).toBe('EM Test Class Promoted')
    expect(data!.roll_number).toBe(7)

    // Restore for subsequent tests/cleanup matching.
    await ownerA
      .from('students')
      .update({ class_name: 'EM Test Class', section: 'A', roll_number: 1 })
      .eq('id', studentId)
  })

  it('transfer_student without p_new_roll keeps existing behavior (roll reset to null on class change)', async () => {
    const { error } = await ownerA.rpc('transfer_student', {
      p_student_id: studentId,
      p_to_class: 'EM Test Class Other',
      p_to_section: null,
      p_to_shift_id: null,
      p_note: null,
    })
    expect(error).toBeNull()
    const { data } = await ownerA.from('students').select('class_name, roll_number').eq('id', studentId).single()
    expect(data!.class_name).toBe('EM Test Class Other')
    expect(data!.roll_number).toBeNull()

    await ownerA
      .from('students')
      .update({ class_name: 'EM Test Class', section: 'A', roll_number: 1 })
      .eq('id', studentId)
  })

  it('multi-exam combination: creates a combination and links member exams', async () => {
    const { data: combo, error } = await ownerA
      .from('exam_combinations')
      .insert({ name: 'EM Test Combo', class_id: classId, strategy: 'weighted_percentage' })
      .select('id')
      .single()
    expect(error).toBeNull()

    const { error: m1Err } = await ownerA
      .from('exam_combination_members')
      .insert({ combination_id: combo!.id, exam_id: examId, weight_percent: 40 })
    expect(m1Err).toBeNull()

    // Second member left blank ("remainder auto-assigned") — accepted.
    const { error: m2Err } = await ownerA
      .from('exam_combination_members')
      .insert({ combination_id: combo!.id, exam_id: secondExamId, weight_percent: null })
    expect(m2Err).toBeNull()
  })

  it('combination member: a second blank-weight member is rejected (at most one)', async () => {
    const { data: combo } = await ownerA
      .from('exam_combinations')
      .insert({ name: 'EM Test Combo Blank', class_id: classId, strategy: 'weighted_percentage' })
      .select('id')
      .single()
    await ownerA.from('exam_combination_members').insert({ combination_id: combo!.id, exam_id: examId, weight_percent: null })

    const { error } = await ownerA
      .from('exam_combination_members')
      .insert({ combination_id: combo!.id, exam_id: secondExamId, weight_percent: null })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('one exam')
  })

  it('combination member: weights over 100% are rejected', async () => {
    const { data: combo } = await ownerA
      .from('exam_combinations')
      .insert({ name: 'EM Test Combo Over', class_id: classId, strategy: 'weighted_percentage' })
      .select('id')
      .single()
    await ownerA.from('exam_combination_members').insert({ combination_id: combo!.id, exam_id: examId, weight_percent: 70 })

    const { error } = await ownerA
      .from('exam_combination_members')
      .insert({ combination_id: combo!.id, exam_id: secondExamId, weight_percent: 40 })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('exceed 100')
  })

  it("cannot combine another school's exam (tenancy trigger)", async () => {
    const { data: foreignExam } = await ownerB
      .from('exams')
      .insert({ name: 'EM Test Foreign Exam', exam_year: 2026 })
      .select('id')
      .single()
    const { data: combo } = await ownerA
      .from('exam_combinations')
      .insert({ name: 'EM Test Combo Foreign', strategy: 'sum' })
      .select('id')
      .single()

    const { error } = await ownerA
      .from('exam_combination_members')
      .insert({ combination_id: combo!.id, exam_id: foreignExam!.id, weight_percent: null })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('exam does not belong to this school')

    await ownerB.from('exams').delete().eq('id', foreignExam!.id)
  })

  it("RLS: another school's owner sees none of this school's combinations", async () => {
    const { data } = await ownerB.from('exam_combinations').select('id').like('name', 'EM Test%')
    expect(data).toHaveLength(0)
  })
})
