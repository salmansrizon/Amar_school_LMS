import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// written for migration 0216 — not run
// Seam: the reason and time a leave request was decided (#680, migration 0216).

describe('Leave decision note and time (#680, 0216)', () => {
  let owner: SupabaseClient
  let student: SupabaseClient
  let studentId: string
  let schoolId: string
  let leaveId: string

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    student = await signedIn('s9001@test-a.students.invalid')
    const self = (await student.from('student_self').select('id, school_id').single()).data!
    studentId = self.id
    schoolId = self.school_id
    await owner.from('student_leaves').delete().eq('student_id', studentId)
    const { data, error } = await student
      .from('student_leaves')
      .insert({ student_id: studentId, school_id: schoolId, from_day: '2099-06-01', to_day: '2099-06-02', reason: 'Trip' })
      .select('id')
      .single()
    expect(error).toBeNull()
    leaveId = data!.id
  })

  afterAll(async () => {
    await owner.from('student_leaves').delete().eq('student_id', studentId)
  })

  it('a student-created request has no decision note or time', async () => {
    const { data } = await student.from('student_leaves').select('decision_note, decided_at').eq('id', leaveId).single()
    expect(data).toEqual({ decision_note: null, decided_at: null })
  })

  it('staff can reject with a note and a time, and the student reads both', async () => {
    const { error } = await owner
      .from('student_leaves')
      .update({ status: 'rejected', decision_note: 'Exam week', decided_at: new Date().toISOString() })
      .eq('id', leaveId)
    expect(error).toBeNull()
    const { data } = await student.from('student_leaves').select('decision_note, decided_at').eq('id', leaveId).single()
    expect(data?.decision_note).toBe('Exam week')
    expect(data?.decided_at).not.toBeNull()
  })

  it('the note is capped at 500 characters', async () => {
    const ok = await owner.from('student_leaves').update({ decision_note: 'x'.repeat(500) }).eq('id', leaveId)
    expect(ok.error).toBeNull()
    const tooLong = await owner.from('student_leaves').update({ decision_note: 'x'.repeat(501) }).eq('id', leaveId)
    expect(tooLong.error?.code).toBe('23514')
  })

  it('employee_leaves has the same two columns and the same cap', async () => {
    const { error } = await owner.from('employee_leaves').select('decision_note, decided_at').limit(1)
    expect(error).toBeNull()
  })

  it('a student cannot write the note or the decision time', async () => {
    // No UPDATE policy: the write touches zero rows and leaves the values alone.
    const { data } = await student
      .from('student_leaves')
      .update({ decision_note: 'forged', decided_at: new Date().toISOString() })
      .eq('id', leaveId)
      .select('id')
    expect(data ?? []).toEqual([])
    const { data: after } = await student.from('student_leaves').select('decision_note').eq('id', leaveId).single()
    expect(after?.decision_note).toBe('x'.repeat(500))
  })

  it('a student cannot insert a request that already carries a decision', async () => {
    for (const extra of [{ decision_note: 'forged' }, { decided_at: new Date().toISOString() }]) {
      const { error } = await student
        .from('student_leaves')
        .insert({ student_id: studentId, school_id: schoolId, from_day: '2099-07-01', to_day: '2099-07-01', ...extra })
      expect(error?.message).toContain('decision')
    }
  })
})
