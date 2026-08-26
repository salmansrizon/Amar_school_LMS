import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn, PASSWORD } from '../helpers/auth'

// Seam: profile correction requests (#456, migration 0149).
//
// The guarantee CONTEXT.md states: a Student never edits a school record. Every
// `students` column stays read-only to them; what they get is a way to ask.

describe('Student profile corrections (#456)', () => {
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
    await owner.from('student_profile_change_requests').delete().eq('student_id', studentId)
  })

  afterAll(async () => {
    await owner.from('student_profile_change_requests').delete().eq('student_id', studentId)
    await owner.from('students').update({ student_mobile: null }).eq('id', studentId)
  })

  it('a student cannot edit their own record directly', async () => {
    // The whole premise. Read-only is RLS, not a disabled input.
    const { data } = await student
      .from('students')
      .update({ student_mobile: '01999999999' })
      .eq('id', studentId)
      .select('id')
    expect(data ?? []).toEqual([])
  })

  it('a student raises a correction request', async () => {
    const { error } = await student.from('student_profile_change_requests').insert({
      school_id: schoolId,
      student_id: studentId,
      field: 'student_mobile',
      current_value: null,
      requested_value: '01711111111',
    })
    expect(error).toBeNull()
  })

  it('refuses a field that belongs to admission or transfer', async () => {
    for (const field of ['roll_number', 'student_no', 'class_name', 'date_of_birth']) {
      const { error } = await student.from('student_profile_change_requests').insert({
        school_id: schoolId,
        student_id: studentId,
        field,
        requested_value: 'x',
      })
      expect(error, field).not.toBeNull()
    }
  })

  it('refuses a request raised on somebody else’s behalf', async () => {
    const { error } = await student.from('student_profile_change_requests').insert({
      school_id: schoolId,
      student_id: '00000000-0000-0000-0000-000000000000',
      field: 'blood_group',
      requested_value: 'B+',
    })
    expect(error).not.toBeNull()
  })

  it('refuses a request that arrives already applied', async () => {
    const { error } = await student.from('student_profile_change_requests').insert({
      school_id: schoolId,
      student_id: studentId,
      field: 'blood_group',
      requested_value: 'B+',
      status: 'applied',
    })
    expect(error).not.toBeNull()
  })

  it('a student cannot resolve their own request', async () => {
    const { data: mine } = await student
      .from('student_profile_change_requests')
      .select('id')
      .limit(1)
    const { data } = await student
      .from('student_profile_change_requests')
      .update({ status: 'applied' })
      .eq('id', mine![0].id)
      .select('id')
    expect(data ?? []).toEqual([])
  })

  it('a staff user cannot apply one either — only the Owner writes the record', async () => {
    const staff = await signedIn('staff-e2e@test.local', PASSWORD)
    const { data: mine } = await student.from('student_profile_change_requests').select('id').limit(1)
    const { error } = await staff.rpc('apply_profile_change_request', { p_request: mine![0].id })
    expect(error).not.toBeNull()
  })

  it('the owner applies it, and the record changes in one transaction', async () => {
    const { data: mine } = await student
      .from('student_profile_change_requests')
      .select('id')
      .eq('status', 'pending')
      .limit(1)

    const { error } = await owner.rpc('apply_profile_change_request', { p_request: mine![0].id })
    expect(error).toBeNull()

    const { data: updated } = await owner
      .from('students')
      .select('student_mobile')
      .eq('id', studentId)
      .single()
    expect(updated!.student_mobile).toBe('01711111111')

    const { data: resolved } = await student
      .from('student_profile_change_requests')
      .select('status')
      .eq('id', mine![0].id)
    expect(resolved).toEqual([{ status: 'applied' }])
  })

  it('applying the same request twice is refused', async () => {
    const { data: applied } = await owner
      .from('student_profile_change_requests')
      .select('id')
      .eq('status', 'applied')
      .limit(1)
    const { error } = await owner.rpc('apply_profile_change_request', { p_request: applied![0].id })
    expect(error?.message).toContain('already been resolved')
  })
})
