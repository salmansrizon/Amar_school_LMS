import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Seam: absence_sms_candidates working-day streak logic + sms_log dedupe
// (issue #12). Gateway swap is unit-tested; dispatch here uses the log path.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SECRET = process.env.RECONCILE_SECRET!
const PASSWORD = 'test-password-123!'
// Fixed historical week: Mon 2026-06-01 … Fri 2026-06-05
const DAYS = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05']

async function signedIn(email: string): Promise<SupabaseClient> {
  const client = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`login failed for ${email}: ${error.message}`)
  return client
}

const anon = () => createClient(URL, ANON, { auth: { persistSession: false } })

describe('Absence SMS Rule (issue #12)', () => {
  let owner: SupabaseClient
  let admin: SupabaseClient
  let schoolId: string
  let studentId: string
  let exactRule: string
  let rangeRule: string

  const candidates = async (day: string) => {
    const { data, error } = await anon().rpc('absence_sms_candidates', {
      job_secret: SECRET,
      target_date: day,
    })
    if (error) throw new Error(error.message)
    return data as { student_id: string; rule_id: string; streak: number }[]
  }

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    admin = await signedIn('super@test.local')
    const {
      data: { user },
    } = await owner.auth.getUser()
    schoolId = (await owner.from('profiles').select('school_id').eq('id', user!.id).single()).data!.school_id

    // Clean slate for the fixed week. Explicit school_id predicates even
    // though RLS already scopes these — this project's Postgres is a shared
    // dev instance other agents use concurrently, so don't rely solely on
    // RLS as the only thing standing between a test and a mass delete.
    await owner.from('students').delete().eq('full_name', 'SMS Test Student')
    await owner.from('absence_sms_rules').delete().eq('school_id', schoolId)
    await owner.from('off_days').delete().eq('school_id', schoolId).in('day', DAYS)
    await admin.from('sms_log').delete().eq('school_id', schoolId)

    studentId = (
      await owner
        .from('students')
        .insert({ full_name: 'SMS Test Student', guardian_phone: '01700000000' })
        .select('id')
        .single()
    ).data!.id

    exactRule = (
      await owner.from('absence_sms_rules').insert({ exact_days: 2 }).select('id').single()
    ).data!.id
    rangeRule = (
      await owner.from('absence_sms_rules').insert({ range_from: 3, range_to: 4 }).select('id').single()
    ).data!.id

    // Wednesday is an off day (should not count as a working day).
    await owner.from('off_days').insert({ day: DAYS[2], label: 'Test holiday' })

    // Student present Monday only; absent every other working day.
    await admin.from('attendance_records').delete().eq('person_id', studentId)
    await admin.from('attendance_records').insert({
      school_id: schoolId,
      person_type: 'student',
      person_id: studentId,
      att_date: DAYS[0],
      entry_at: `${DAYS[0]}T08:00:00Z`,
      status: 'present',
    })
  })

  afterAll(async () => {
    await admin.from('sms_log').delete().eq('school_id', schoolId)
    await owner.from('absence_sms_rules').delete().in('id', [exactRule, rangeRule])
    await owner.from('off_days').delete().in('day', DAYS)
    await owner.from('student_leaves').delete().eq('student_id', studentId)
    await owner.from('students').delete().eq('id', studentId)
  })

  it('Tuesday: 1 working-day absent — below both rules, no candidates', async () => {
    const rows = await candidates(DAYS[1])
    expect(rows.filter((r) => r.student_id === studentId)).toEqual([])
  })

  it('Thursday: streak = 2 (off-day Wednesday skipped) — exact-2 rule fires', async () => {
    const rows = (await candidates(DAYS[3])).filter((r) => r.student_id === studentId)
    expect(rows).toHaveLength(1)
    expect(rows[0].rule_id).toBe(exactRule)
    expect(rows[0].streak).toBe(2)
  })

  it('Friday: streak = 3 — the 3–4 range rule fires, exact-2 does not', async () => {
    const rows = (await candidates(DAYS[4])).filter((r) => r.student_id === studentId)
    expect(rows).toHaveLength(1)
    expect(rows[0].rule_id).toBe(rangeRule)
    expect(rows[0].streak).toBe(3)
  })

  it('approved leave breaks the absence (leave days are not working days)', async () => {
    // status: 'approved' — student_leaves gained an approval workflow via a
    // sibling ticket's live migration; is_absent_working_day only excludes
    // approved leave (matches "Approved Leave" in the PRD formula).
    const { error } = await owner.from('student_leaves').insert({
      student_id: studentId,
      from_day: DAYS[3],
      to_day: DAYS[4],
      status: 'approved',
    })
    expect(error).toBeNull()
    const workingDay = await anon().rpc('is_absent_working_day', {
      sid: studentId,
      school: schoolId,
      d: DAYS[4],
    })
    expect(workingDay.error).toBeNull()
    expect(workingDay.data).toBe(false)
    const rows = (await candidates(DAYS[4])).filter((r) => r.student_id === studentId)
    expect(rows).toEqual([])
    await owner.from('student_leaves').delete().eq('student_id', studentId)
  })

  it('a pending (unapproved) leave request does NOT break the absence (issue #29)', async () => {
    await owner.from('student_leaves').insert({
      student_id: studentId,
      from_day: DAYS[3],
      to_day: DAYS[4],
      // status omitted -> defaults to 'pending'
    })
    const rows = (await candidates(DAYS[4])).filter((r) => r.student_id === studentId)
    expect(rows).toHaveLength(1)
    expect(rows[0].rule_id).toBe(rangeRule)
    await owner.from('student_leaves').delete().eq('student_id', studentId)
  })

  it('the send log dedupes per student/rule/day and reports date-range totals', async () => {
    // record_absence_sms now returns the new sms_log row's id (or null on a
    // deduped conflict) instead of a boolean — issue #36 needed the id back
    // so the caller can flip status to 'failed' after the real send attempt,
    // and a batch_id/segments pair so the Send Log can group + total sends.
    const record = (day: string) =>
      anon().rpc('record_absence_sms', {
        job_secret: SECRET,
        p_school: schoolId,
        p_student: studentId,
        p_rule: exactRule,
        p_sent_on: day,
        p_phone: '01700000000',
        p_body: 'absent 2 working days',
        p_provider: 'log',
      })

    expect((await record(DAYS[3])).data).toBeTruthy()
    expect((await record(DAYS[3])).data).toBeNull() // same day: deduped
    expect((await record(DAYS[4])).data).toBeTruthy()

    const { count } = await owner
      .from('sms_log')
      .select('id', { count: 'exact', head: true })
      .gte('sent_on', DAYS[0])
      .lte('sent_on', DAYS[4])
    expect(count).toBe(2)
  })

  it('rejects a wrong job secret', async () => {
    const { error } = await anon().rpc('absence_sms_candidates', {
      job_secret: 'nope',
      target_date: DAYS[3],
    })
    expect(error).not.toBeNull()
  })
})
