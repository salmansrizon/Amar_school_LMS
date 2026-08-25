import { describe, it, expect, beforeAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// Seam: the Student's RLS surface (map #434, #441, design in #438).
//
// A Student is the first role that reads a School's data without being on its
// staff, so this suite is the safety net for the whole portal. Fixtures come
// from web/supabase/seed-test.sql: s9001@test-a.students.invalid, a Student of
// Test School A in "Seed Class - A".

const STUDENT = 's9001@test-a.students.invalid'

// The permanent negative space (#438 §4) — tables a Student must never reach,
// no matter which later ticket on this map ships. Tables that are merely *not
// open yet* deliberately stay out of this list, so opening one later is not a
// test edit here.
const FORBIDDEN = [
  'behaviour_log_entries',
  'staff_permissions',
  'feedback_messages',
  'sms_log',
  'employees',
  'invoices',
  'payments',
  'wallets',
  'partner_tasks',
  'settlements',
  'gl_entries',
] as const

describe('Student portal RLS (#441)', () => {
  let student: SupabaseClient
  let ownerA: SupabaseClient

  beforeAll(async () => {
    student = await signedIn(STUDENT)
    ownerA = await signedIn('owner-a@test.local')
  })

  it('reads their own row through student_self, and only theirs', async () => {
    const { data, error } = await student
      .from('student_self')
      .select('student_no, full_name, class_name, section')
    expect(error).toBeNull()
    expect(data).toEqual([
      { student_no: 'S9001', full_name: 'Seed Student A', class_name: 'Seed Class', section: 'A' },
    ])
  })

  it('student_self does not carry the admission internals at all', async () => {
    // Absent from the view, not merely unselected by the UI — the column cannot
    // be named, so no REST caller can ask for it.
    const { error: nid } = await student.from('student_self').select('guardian_nid')
    const { error: sibling } = await student.from('student_self').select('sibling_info')
    expect(nid).not.toBeNull()
    expect(sibling).not.toBeNull()
  })

  it('has no read on the students table itself', async () => {
    const { data, error } = await student.from('students').select('id, full_name')
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('cannot write a school-owned row', async () => {
    const insert = await student
      .from('students')
      .insert({ full_name: 'Forged Student', class_name: 'Seed Class' })
    expect(insert.error).not.toBeNull()

    const { data: mine } = await student.from('student_self').select('id')
    const update = await student
      .from('students')
      .update({ full_name: 'Renamed By Student' })
      .eq('id', mine![0].id)
      .select('id')
    // Denied either as an error or as zero affected rows, depending on how
    // PostgREST reports a policy miss — both mean "nothing changed".
    expect(update.error ?? (update.data?.length === 0 ? null : update.data)).toBeNull()
  })

  it('reads exactly their own school and their own class', async () => {
    const { data: schools } = await student.from('schools').select('name')
    expect(schools).toEqual([{ name: 'Test School A' }])

    const { data: classes } = await student.from('classes').select('name, section')
    expect(classes).toEqual([{ name: 'Seed Class', section: 'A' }])
  })

  it.each(FORBIDDEN)('reaches nothing in %s', async (table) => {
    const { data, error } = await student.from(table).select('*')
    // Either shape counts as denied: a policy miss returns [], a missing grant errors.
    expect(error ? true : data).toEqual(error ? true : [])
  })

  it('narrowing app_current_school_id left the School Owner untouched', async () => {
    // #441 redefined app_current_school_id() to exclude students. Every legacy
    // policy leans on it, so pin that the owner side still resolves.
    const { data, error } = await ownerA.from('students').select('id').limit(1)
    expect(error).toBeNull()
    expect(data!.length).toBeGreaterThan(0)
  })
})
