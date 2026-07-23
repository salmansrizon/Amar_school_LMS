import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// Seam: manual student attendance marking (save_student_attendance RPC),
// leave approval lifecycle, employee_leaves tenancy trigger, off_days
// significance (issue #29).
const DATE = '2026-07-08'

describe('Attendance I: manual marking, leave approval, off-days (issue #29)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let studentA: string
  let studentB: string
  let employeeA: string

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')

    await ownerA.from('students').delete().eq('full_name', 'Attendance Test Student A')
    await ownerB.from('students').delete().eq('full_name', 'Attendance Test Student B')
    await ownerA.from('employees').delete().eq('full_name', 'Attendance Test Employee A')

    studentA = (
      await ownerA
        .from('students')
        .insert({ full_name: 'Attendance Test Student A', class_name: 'Class 9', section: 'A' })
        .select('id')
        .single()
    ).data!.id
    studentB = (
      await ownerB.from('students').insert({ full_name: 'Attendance Test Student B' }).select('id').single()
    ).data!.id
    employeeA = (
      await ownerA.from('employees').insert({ full_name: 'Attendance Test Employee A' }).select('id').single()
    ).data!.id
  })

  afterAll(async () => {
    await ownerA.from('attendance_records').delete().in('person_id', [studentA])
    await ownerA.from('attendance_absence_notes').delete().in('person_id', [studentA])
    await ownerA.from('student_leaves').delete().eq('student_id', studentA)
    await ownerA.from('employee_leaves').delete().eq('employee_id', employeeA)
    await ownerA.from('off_days').delete().eq('day', DATE)
    await ownerA.from('students').delete().eq('id', studentA)
    await ownerB.from('students').delete().eq('id', studentB)
    await ownerA.from('employees').delete().eq('id', employeeA)
  })

  it('marks a student present via the RPC', async () => {
    const { data, error } = await ownerA.rpc('save_student_attendance', {
      p_att_date: DATE,
      p_records: [{ student_id: studentA, present: true, cause: '' }],
    })
    expect(error).toBeNull()
    expect(data).toBe(1)

    const { data: rec } = await ownerA
      .from('attendance_records')
      .select('status')
      .eq('person_type', 'student')
      .eq('person_id', studentA)
      .eq('att_date', DATE)
      .single()
    expect(rec?.status).toBe('present')
  })

  it('marking absent with a cause stores a note instead of an attendance record', async () => {
    await ownerA.rpc('save_student_attendance', {
      p_att_date: DATE,
      p_records: [{ student_id: studentA, present: false, cause: 'Fever, mother called' }],
    })

    const { data: rec } = await ownerA
      .from('attendance_records')
      .select('id')
      .eq('person_type', 'student')
      .eq('person_id', studentA)
      .eq('att_date', DATE)
      .maybeSingle()
    expect(rec).toBeNull()

    const { data: note } = await ownerA
      .from('attendance_absence_notes')
      .select('cause')
      .eq('person_type', 'student')
      .eq('person_id', studentA)
      .eq('att_date', DATE)
      .single()
    expect(note?.cause).toBe('Fever, mother called')
  })

  it('switching back to present clears the absence note', async () => {
    await ownerA.rpc('save_student_attendance', {
      p_att_date: DATE,
      p_records: [{ student_id: studentA, present: true, cause: '' }],
    })

    const { data: note } = await ownerA
      .from('attendance_absence_notes')
      .select('cause')
      .eq('person_type', 'student')
      .eq('person_id', studentA)
      .eq('att_date', DATE)
      .maybeSingle()
    expect(note).toBeNull()

    const { data: rec } = await ownerA
      .from('attendance_records')
      .select('status')
      .eq('person_type', 'student')
      .eq('person_id', studentA)
      .eq('att_date', DATE)
      .single()
    expect(rec?.status).toBe('present')
  })

  it('rejects marking a student from another school', async () => {
    const { error } = await ownerA.rpc('save_student_attendance', {
      p_att_date: DATE,
      p_records: [{ student_id: studentB, present: true, cause: '' }],
    })
    expect(error).not.toBeNull()
  })

  it('a bare leave insert defaults to pending, and approving flips it', async () => {
    const { data: leave } = await ownerA
      .from('student_leaves')
      .insert({ student_id: studentA, from_day: DATE, to_day: DATE })
      .select('id, status')
      .single()
    expect(leave?.status).toBe('pending')

    const { data: approved } = await ownerA
      .from('student_leaves')
      .update({ status: 'approved' })
      .eq('id', leave!.id)
      .select('status')
      .single()
    expect(approved?.status).toBe('approved')
  })

  it('a school owner cannot approve another school\'s leave request (RLS)', async () => {
    const { data: leave } = await ownerA
      .from('student_leaves')
      .insert({ student_id: studentA, from_day: DATE, to_day: DATE })
      .select('id')
      .single()

    const { data: crossUpdate } = await ownerB
      .from('student_leaves')
      .update({ status: 'approved' })
      .eq('id', leave!.id)
      .select('id')
    expect(crossUpdate).toEqual([])

    const { data: stillPending } = await ownerA
      .from('student_leaves')
      .select('status')
      .eq('id', leave!.id)
      .single()
    expect(stillPending?.status).toBe('pending')
  })

  it('employee_leaves rejects an employee that belongs to another school', async () => {
    // ownerB has no school_id override on insert, so the row lands in School
    // B while employeeA belongs to School A — the tenancy trigger must block it.
    const { error } = await ownerB
      .from('employee_leaves')
      .insert({ employee_id: employeeA, from_day: DATE, to_day: DATE })
    expect(error).not.toBeNull()
  })

  it('employee_leaves accepts a same-school employee and defaults to pending', async () => {
    const { data, error } = await ownerA
      .from('employee_leaves')
      .insert({ employee_id: employeeA, from_day: DATE, to_day: DATE, reason: 'Medical' })
      .select('status')
      .single()
    expect(error).toBeNull()
    expect(data?.status).toBe('pending')
  })

  it('off_days accepts the is_significant flag and defaults to false', async () => {
    await ownerA.from('off_days').delete().eq('day', DATE)
    const { data: plain } = await ownerA.from('off_days').insert({ day: DATE, label: 'Test' }).select('is_significant').single()
    expect(plain?.is_significant).toBe(false)

    const { data: sig } = await ownerA
      .from('off_days')
      .update({ is_significant: true })
      .eq('day', DATE)
      .select('is_significant')
      .single()
    expect(sig?.is_significant).toBe(true)
  })
})
