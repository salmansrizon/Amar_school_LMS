import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// Seam: migration 0167 / ticket #536. Two findings that look alike and are not.
const TAG = 'ZZ536'

describe('One exam per name and year (#536)', () => {
  let owner: SupabaseClient

  const exam = (name: string, year = 2031) => ({ name, exam_year: year })

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    await owner.from('exams').delete().like('name', `${TAG}%`)
  })

  afterAll(async () => {
    await owner.from('exams').delete().like('name', `${TAG}%`)
  })

  it('accepts the first exam of a name and year', async () => {
    const { error } = await owner.from('exams').insert(exam(`${TAG} Finals`))
    expect(error).toBeNull()
  })

  // The student-side symptom: twelve identical exams, each with its own id and
  // its own routine, so the exam list repeated and each copy scheduled differently.
  it('refuses a second exam of the same name in the same year', async () => {
    const { error } = await owner.from('exams').insert(exam(`${TAG} Finals`))
    expect(error).not.toBeNull()
  })

  it('is case-insensitive', async () => {
    const { error } = await owner.from('exams').insert(exam(`${TAG.toLowerCase()} finals`))
    expect(error).not.toBeNull()
  })

  it('still allows the same exam name in a different year', async () => {
    const { error } = await owner.from('exams').insert(exam(`${TAG} Finals`, 2032))
    expect(error).toBeNull()
  })
})

describe('One PENDING correction per field, history untouched (#536)', () => {
  let student: SupabaseClient
  let owner: SupabaseClient
  // Teardown runs as super admin, not as the Owner. The Owner's policy on this
  // table is UPDATE only ("owner resolves change requests") — a delete() as Owner
  // removes nothing and reports no error, so the previous run's pending row
  // survives and the first insert of the next run fails on the very constraint
  // this file is testing.
  let admin: SupabaseClient
  let studentId: string
  let schoolId: string

  beforeAll(async () => {
    student = await signedIn('s9001@test-a.students.invalid')
    owner = await signedIn('owner-a@test.local')
    admin = await signedIn('super@test.local')
    // school_id is not optional: the insert policy checks it against
    // app_current_student_school_id(), so a request without it is refused before
    // the uniqueness rule this file is about ever gets a say.
    const { data } = await owner.from('students').select('id, school_id').eq('student_no', 'S9001').single()
    studentId = data!.id
    schoolId = data!.school_id
    await admin.from('student_profile_change_requests').delete().eq('student_id', studentId)
  })

  afterAll(async () => {
    await admin.from('student_profile_change_requests').delete().eq('student_id', studentId)
  })

  it('accepts a correction request', async () => {
    const { error } = await student
      .from('student_profile_change_requests')
      .insert({ student_id: studentId, school_id: schoolId, field: 'student_mobile', requested_value: '01700000001' })
    expect(error).toBeNull()
  })

  // The defect is being able to queue the same correction while one is waiting —
  // that is what puts identical rows in front of an Owner with no way to tell
  // them apart, and what let one student submit fifteen times.
  it('refuses a second pending request for the same field', async () => {
    const { error } = await student
      .from('student_profile_change_requests')
      .insert({ student_id: studentId, school_id: schoolId, field: 'student_mobile', requested_value: '01700000002' })
    expect(error).not.toBeNull()
  })

  it('allows a pending request for a different field', async () => {
    const { error } = await student
      .from('student_profile_change_requests')
      .insert({ student_id: studentId, school_id: schoolId, field: 'guardian_mobile', requested_value: '01700000003' })
    expect(error).toBeNull()
  })

  // History is not duplication: a student may legitimately correct the same field
  // again later, and an applied request records a change that really happened.
  it('allows a new request once the previous one is resolved', async () => {
    await owner
      .from('student_profile_change_requests')
      .update({ status: 'applied' })
      .eq('student_id', studentId)
      .eq('field', 'student_mobile')

    const { error } = await student
      .from('student_profile_change_requests')
      .insert({ student_id: studentId, school_id: schoolId, field: 'student_mobile', requested_value: '01700000004' })
    expect(error).toBeNull()

    const { data } = await owner
      .from('student_profile_change_requests')
      .select('status')
      .eq('student_id', studentId)
      .eq('field', 'student_mobile')
    expect((data ?? []).length).toBe(2)
  })
})
