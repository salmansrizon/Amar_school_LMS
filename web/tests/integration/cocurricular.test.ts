import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Seam: Exams IV — mark sheets & progress reports (issue #33, PRD §5.5).
// cocurricular_items (school-scoped activity list) + cocurricular_checklist_marks
// (per exam/student/item, migration 0052) mirror exam_marks' (migration 0048)
// same-school-tenancy + Closed-exam-immutability pattern.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const PASSWORD = 'test-password-123!'

async function signedIn(email: string): Promise<SupabaseClient> {
  const client = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`login failed for ${email}: ${error.message}`)
  return client
}

describe('Co-curricular checklist (issue #33)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let classId: string
  let studentId: string
  let foreignStudentId: string
  let itemId: string
  let foreignItemId: string
  let examId: string
  let closedExamId: string

  async function cleanup(client: SupabaseClient) {
    await client.from('cocurricular_items').delete().like('label', 'CC Test%')
    await client.from('exams').delete().like('name', 'CC Test%')
    await client.from('classes').delete().like('name', 'CC Test%')
    await client.from('students').delete().like('full_name', 'CC Test%')
  }

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    await cleanup(ownerA)
    await cleanup(ownerB)

    classId = (
      await ownerA.from('classes').insert({ name: 'CC Test Class', section: 'A' }).select('id').single()
    ).data!.id
    studentId = (
      await ownerA
        .from('students')
        .insert({ full_name: 'CC Test Student', class_name: 'CC Test Class', section: 'A', roll_number: 1 })
        .select('id')
        .single()
    ).data!.id
    foreignStudentId = (
      await ownerB.from('students').insert({ full_name: 'CC Test Foreign Student' }).select('id').single()
    ).data!.id
    itemId = (
      await ownerA.from('cocurricular_items').insert({ label: 'CC Test Sports', sort_order: 1 }).select('id').single()
    ).data!.id
    foreignItemId = (
      await ownerB.from('cocurricular_items').insert({ label: 'CC Test Foreign Item' }).select('id').single()
    ).data!.id

    examId = (
      await ownerA
        .from('exams')
        .insert({ name: 'CC Test Exam', exam_year: 2026, class_id: classId })
        .select('id')
        .single()
    ).data!.id
    closedExamId = (
      await ownerA
        .from('exams')
        .insert({ name: 'CC Test Closed Exam', exam_year: 2026, class_id: classId })
        .select('id')
        .single()
    ).data!.id
    const { error: closeErr } = await ownerA.rpc('close_exam', { exam: closedExamId })
    if (closeErr) throw new Error(`setup: closing exam failed: ${closeErr.message}`)
  })

  afterAll(async () => {
    // Closed exams are undeletable by school roles — clean up as Super Admin.
    const admin = await signedIn('super@test.local')
    await admin.from('exams').delete().like('name', 'CC Test%')
    await cleanup(ownerA)
    await cleanup(ownerB)
  })

  it('checks an item for a student in an exam', async () => {
    const { data, error } = await ownerA
      .from('cocurricular_checklist_marks')
      .insert({ exam_id: examId, student_id: studentId, item_id: itemId, checked: true })
      .select('checked')
      .single()
    expect(error).toBeNull()
    expect(data!.checked).toBe(true)
  })

  it('one row per (exam, student, item); re-save upserts', async () => {
    const { error } = await ownerA
      .from('cocurricular_checklist_marks')
      .upsert(
        { exam_id: examId, student_id: studentId, item_id: itemId, checked: false },
        { onConflict: 'exam_id,student_id,item_id' },
      )
    expect(error).toBeNull()
    const { data } = await ownerA
      .from('cocurricular_checklist_marks')
      .select('id, checked')
      .eq('exam_id', examId)
      .eq('student_id', studentId)
      .eq('item_id', itemId)
    expect(data).toHaveLength(1)
    expect(data![0].checked).toBe(false)
  })

  it("cannot check an item for another school's student (tenancy trigger)", async () => {
    const { error } = await ownerA
      .from('cocurricular_checklist_marks')
      .insert({ exam_id: examId, student_id: foreignStudentId, item_id: itemId, checked: true })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('student does not belong to this school')
  })

  it("cannot use another school's checklist item (tenancy trigger)", async () => {
    const { error } = await ownerA
      .from('cocurricular_checklist_marks')
      .insert({ exam_id: examId, student_id: studentId, item_id: foreignItemId, checked: true })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('checklist item does not belong to this school')
  })

  it('checklist entry is rejected once the exam is closed', async () => {
    const { error } = await ownerA
      .from('cocurricular_checklist_marks')
      .insert({ exam_id: closedExamId, student_id: studentId, item_id: itemId, checked: true })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('exam is closed')
  })

  it("RLS: another school's owner sees none of ownerA's checklist item or marks", async () => {
    // ownerB legitimately sees their OWN 'CC Test%' item (foreignItemId) —
    // the assertion is that ownerA's itemId specifically stays invisible.
    const { data: items } = await ownerB.from('cocurricular_items').select('id').eq('id', itemId)
    expect(items).toHaveLength(0)
    const { data: marks } = await ownerB.from('cocurricular_checklist_marks').select('id').eq('exam_id', examId)
    expect(marks).toHaveLength(0)
  })
})
