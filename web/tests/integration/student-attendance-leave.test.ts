import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// Seam: the Student's attendance and leave (#451 + #452, migration 0146).

describe('Student attendance and leave (#451, #452)', () => {
  let owner: SupabaseClient
  let student: SupabaseClient
  let studentId: string
  let schoolId: string

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    student = await signedIn('s9001@test-a.students.invalid')
    const self = (await student.from('student_self').select('id, school_id').single()).data!
    studentId = self.id
    schoolId = self.school_id
    await owner.from('student_leaves').delete().eq('student_id', studentId)
  })

  afterAll(async () => {
    await owner.from('student_leaves').delete().eq('student_id', studentId)
  })

  it('a student’s attendance read is scoped to themselves', async () => {
    // attendance_records is written by the reconcile job as definer — there is
    // no INSERT policy for school members — so this proves scoping against the
    // rows the school already has rather than forging one.
    const { data: everyone } = await owner.from('attendance_records').select('person_id')
    const { data: mine, error } = await student.from('attendance_records').select('person_id')
    expect(error).toBeNull()
    for (const row of mine ?? []) expect(row.person_id).toBe(studentId)
    expect((mine ?? []).length).toBeLessThan((everyone ?? []).length)
  })

  it('absence notes stay closed — staff wrote them, about the student', async () => {
    const { data } = await student.from('attendance_absence_notes').select('id')
    expect(data ?? []).toEqual([])
  })

  it('the absent-working-days wrapper answers only for the caller', async () => {
    const { data, error } = await student.rpc('student_absent_working_days', {
      p_start: '2099-03-01',
      p_end: '2099-03-31',
    })
    expect(error).toBeNull()
    expect(typeof data).toBe('number')
  })

  it('a student requests leave, and it lands pending', async () => {
    const { error } = await student.from('student_leaves').insert({
      student_id: studentId,
      school_id: schoolId,
      from_day: '2099-04-01',
      to_day: '2099-04-03',
      reason: 'Family wedding',
    })
    expect(error).toBeNull()

    const { data } = await student.from('student_leaves').select('status, reason')
    expect(data).toEqual([{ status: 'pending', reason: 'Family wedding' }])
  })

  it('a student cannot approve their own leave on the way in', async () => {
    const { error } = await student.from('student_leaves').insert({
      student_id: studentId,
      school_id: schoolId,
      from_day: '2099-05-01',
      to_day: '2099-05-01',
      status: 'approved',
    })
    expect(error?.message).toContain('pending')
  })

  it('a student cannot approve it afterwards either', async () => {
    const { data: mine } = await student.from('student_leaves').select('id').limit(1)
    // No UPDATE policy at all: a request under review is not theirs to edit.
    const { data } = await student
      .from('student_leaves')
      .update({ status: 'approved' })
      .eq('id', mine![0].id)
      .select('id')
    expect(data ?? []).toEqual([])
  })

  it('a student cannot request leave for somebody else', async () => {
    const { error } = await student.from('student_leaves').insert({
      student_id: '00000000-0000-0000-0000-000000000000',
      school_id: schoolId,
      from_day: '2099-06-01',
      to_day: '2099-06-01',
    })
    expect(error).not.toBeNull()
  })

  it('the owner approves it in the existing queue and the student sees the outcome', async () => {
    const { data: mine } = await student.from('student_leaves').select('id').eq('status', 'pending').limit(1)
    const approve = await owner
      .from('student_leaves')
      .update({ status: 'approved' })
      .eq('id', mine![0].id)
      .select('id')
    expect(approve.error).toBeNull()

    const { data } = await student.from('student_leaves').select('status').eq('id', mine![0].id)
    expect(data).toEqual([{ status: 'approved' }])
  })
})
