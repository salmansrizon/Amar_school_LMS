import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Seam: Exams IV (issue #33, PRD §5.5) — absent_working_days_in_range
// generalizes issue #34's absent_working_days_in_month (migration 0039) to
// an arbitrary date range for the progress report's Attendance % figure,
// reusing the same is_absent_working_day (0021/0037/0046) per-day rule.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const PASSWORD = 'test-password-123!'

async function signedIn(email: string): Promise<SupabaseClient> {
  const client = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`login failed for ${email}: ${error.message}`)
  return client
}

describe('absent_working_days_in_range RPC (issue #33)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let studentId: string
  const START = '2026-07-01'
  const END = '2026-07-05'

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')

    await ownerA.from('students').delete().eq('full_name', 'AWDR Test Student')
    studentId = (
      await ownerA.from('students').insert({ full_name: 'AWDR Test Student' }).select('id').single()
    ).data!.id

    await ownerA.from('off_days').delete().eq('day', '2026-07-02')
    await ownerA.from('student_leaves').delete().eq('student_id', studentId)

    // Off day: 07-02 — the rest of the 5-day range (07-01, 03, 04, 05) has no
    // attendance_records row (a school role never inserts that table
    // directly; only the SECURITY DEFINER save_student_attendance /
    // reconcile_attendance RPCs do, per migration 0046/0047 — mirrors why
    // fee-structures.test.ts's sibling absent_working_days_in_month test
    // asserts a before/after delta rather than an absolute "present" count),
    // so all 4 remaining days read as absent working days.
    await ownerA.from('off_days').insert({ day: '2026-07-02', label: 'AWDR Test holiday' })
  })

  afterAll(async () => {
    await ownerA.from('student_leaves').delete().eq('student_id', studentId)
    await ownerA.from('off_days').delete().eq('day', '2026-07-02')
    await ownerA.from('students').delete().eq('full_name', 'AWDR Test Student')
  })

  it('counts absent working days over the range, excluding the off-day', async () => {
    const { data, error } = await ownerA.rpc('absent_working_days_in_range', {
      p_student: studentId,
      p_start: START,
      p_end: END,
    })
    expect(error).toBeNull()
    expect(data).toBe(4)
  })

  it('an approved leave over part of the range excuses exactly those days', async () => {
    const { data: before } = await ownerA.rpc('absent_working_days_in_range', {
      p_student: studentId,
      p_start: START,
      p_end: END,
    })
    await ownerA.from('student_leaves').insert({
      student_id: studentId,
      from_day: '2026-07-04',
      to_day: '2026-07-05',
      status: 'approved',
    })
    const { data: after, error } = await ownerA.rpc('absent_working_days_in_range', {
      p_student: studentId,
      p_start: START,
      p_end: END,
    })
    expect(error).toBeNull()
    expect(after).toBe(before - 2)
    await ownerA.from('student_leaves').delete().eq('student_id', studentId)
  })

  it("rejects another school's owner reading this student's absence count", async () => {
    const { error } = await ownerB.rpc('absent_working_days_in_range', {
      p_student: studentId,
      p_start: START,
      p_end: END,
    })
    expect(error).not.toBeNull()
  })
})
