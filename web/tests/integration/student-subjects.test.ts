import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Seam: Students II subject assignment (issue #46, PRD §5.1 second half) —
// student_subjects (compulsory/optional per student, same-school tenancy
// trigger, RLS-scoped) plus the sms_log insert policy that lets a School
// member log a behaviour-record SMS send from their own session.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const PASSWORD = 'test-password-123!'

async function signedIn(email: string): Promise<SupabaseClient> {
  const client = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`login failed for ${email}: ${error.message}`)
  return client
}

describe('Students II: subject assignment (issue #46)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let studentId: string
  let subjectId: string
  let foreignStudentId: string
  let foreignSubjectId: string

  async function cleanup(client: SupabaseClient) {
    await client.from('students').delete().like('full_name', 'SS Test%')
    await client.from('subjects').delete().like('name', 'SS Test%')
  }

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    await cleanup(ownerA)
    await cleanup(ownerB)

    studentId = (
      await ownerA.from('students').insert({ full_name: 'SS Test Student' }).select('id').single()
    ).data!.id
    subjectId = (
      await ownerA
        .from('subjects')
        .insert({ name: 'SS Test Subject', theory_marks: 100 })
        .select('id')
        .single()
    ).data!.id
    foreignStudentId = (
      await ownerB.from('students').insert({ full_name: 'SS Test Foreign' }).select('id').single()
    ).data!.id
    foreignSubjectId = (
      await ownerB
        .from('subjects')
        .insert({ name: 'SS Test Foreign Subject', theory_marks: 100 })
        .select('id')
        .single()
    ).data!.id
  })

  afterAll(async () => {
    await ownerA.from('student_subjects').delete().eq('student_id', studentId)
    await ownerB.from('student_subjects').delete().eq('student_id', foreignStudentId)
    await cleanup(ownerA)
    await cleanup(ownerB)
  })

  it('assigns a subject to a student as compulsory by default', async () => {
    const { error } = await ownerA
      .from('student_subjects')
      .insert({ student_id: studentId, subject_id: subjectId })
    expect(error).toBeNull()
    const { data } = await ownerA
      .from('student_subjects')
      .select('is_optional')
      .eq('student_id', studentId)
      .eq('subject_id', subjectId)
      .single()
    expect(data?.is_optional).toBe(false)
  })

  it('the same student/subject pair upserts in place instead of duplicating', async () => {
    const { error } = await ownerA
      .from('student_subjects')
      .upsert(
        { student_id: studentId, subject_id: subjectId, is_optional: true },
        { onConflict: 'student_id,subject_id' },
      )
    expect(error).toBeNull()
    const { data } = await ownerA
      .from('student_subjects')
      .select('is_optional')
      .eq('student_id', studentId)
      .eq('subject_id', subjectId)
    expect(data).toHaveLength(1)
    expect(data![0].is_optional).toBe(true)
  })

  it("a row cannot reference another school's student (tenancy trigger)", async () => {
    const { error } = await ownerA
      .from('student_subjects')
      .insert({ student_id: foreignStudentId, subject_id: subjectId })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('student does not belong to this school')
  })

  it("a row cannot reference another school's subject (tenancy trigger)", async () => {
    const { error } = await ownerA
      .from('student_subjects')
      .insert({ student_id: studentId, subject_id: foreignSubjectId })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('subject does not belong to this school')
  })

  it("RLS: another school's owner sees none of the assignments", async () => {
    const { data } = await ownerB.from('student_subjects').select('student_id').eq('student_id', studentId)
    expect(data).toHaveLength(0)
  })

  it('removing an assignment deletes the row', async () => {
    await ownerA
      .from('student_subjects')
      .delete()
      .eq('student_id', studentId)
      .eq('subject_id', subjectId)
    const { data } = await ownerA
      .from('student_subjects')
      .select('student_id')
      .eq('student_id', studentId)
      .eq('subject_id', subjectId)
    expect(data).toHaveLength(0)
  })

  it('a school member can log a behaviour SMS send for their own school', async () => {
    const { error } = await ownerA.from('sms_log').insert({
      school_id: (await ownerA.from('students').select('school_id').eq('id', studentId).single()).data!
        .school_id,
      student_id: studentId,
      sent_on: new Date().toISOString().slice(0, 10),
      phone: '01700000000',
      body: 'test behaviour sms',
      provider: 'log',
    })
    expect(error).toBeNull()
  })

  it("a school member cannot log an sms_log row under another school's id", async () => {
    const { error } = await ownerA.from('sms_log').insert({
      school_id: (await ownerB.from('students').select('school_id').eq('id', foreignStudentId).single())
        .data!.school_id,
      student_id: foreignStudentId,
      sent_on: new Date().toISOString().slice(0, 10),
      phone: '01700000000',
      body: 'forged sms',
      provider: 'log',
    })
    expect(error).not.toBeNull()
  })
})
