import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loadExamRosterResults, loadExamPrintContext } from '@/lib/exam-print-data'
import { filterResultRoster, roomForRoll } from '@/lib/exam-setup'

// Seam: Exams V (issue #48, PRD §5.5) — the whole-roster loader (result book,
// result inquiry, batch print-all) and its roll-range/promoted-only filter +
// seat-plan-derived exam-center lookup, exercised end to end against a real
// seeded exam/class/roster the same way the app pages call them, not just
// raw table shape checks.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const PASSWORD = 'test-password-123!'

async function signedIn(email: string): Promise<SupabaseClient> {
  const client = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`login failed for ${email}: ${error.message}`)
  return client
}

describe('Exams V — result roster, roll-range/promoted filter, exam-center (issue #48)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let classId: string
  let subjectId: string
  let schemeId: string
  let roomId: string
  let examId: string
  let passStudentId: string
  let failStudentId: string

  async function cleanup(client: SupabaseClient) {
    await client.from('exams').delete().like('name', 'PA Test%')
    await client.from('grading_schemes').delete().like('name', 'PA Test%')
    await client.from('classes').delete().like('name', 'PA Test%')
    await client.from('rooms').delete().like('name', 'PA Test%')
    await client.from('students').delete().like('full_name', 'PA Test%')
  }

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    await cleanup(ownerA)
    await cleanup(ownerB)

    classId = (
      await ownerA.from('classes').insert({ name: 'PA Test Class', section: 'A' }).select('id').single()
    ).data!.id
    subjectId = (
      await ownerA
        .from('subjects')
        .insert({ class_id: classId, name: 'PA Test Subject', theory_marks: 100 })
        .select('id')
        .single()
    ).data!.id
    schemeId = (
      await ownerA
        .from('grading_schemes')
        .insert({ name: 'PA Test Scheme', scheme_type: 'letter', pass_mark_percent: 33, pass_rule_strategy: 'individual' })
        .select('id')
        .single()
    ).data!.id
    await ownerA.from('grade_bands').insert({ grading_scheme_id: schemeId, label: 'Pass', min_percent: 33, max_percent: 100 })
    roomId = (
      await ownerA.from('rooms').insert({ name: 'PA Test Room', capacity: 30 }).select('id').single()
    ).data!.id

    passStudentId = (
      await ownerA
        .from('students')
        .insert({ full_name: 'PA Test Pass Student', class_name: 'PA Test Class', section: 'A', roll_number: 1 })
        .select('id')
        .single()
    ).data!.id
    failStudentId = (
      await ownerA
        .from('students')
        .insert({ full_name: 'PA Test Fail Student', class_name: 'PA Test Class', section: 'A', roll_number: 2 })
        .select('id')
        .single()
    ).data!.id

    examId = (
      await ownerA
        .from('exams')
        .insert({ name: 'PA Test Exam', exam_year: 2026, class_id: classId, grading_scheme_id: schemeId })
        .select('id')
        .single()
    ).data!.id

    await ownerA.from('exam_marks').insert([
      { exam_id: examId, student_id: passStudentId, subject_id: subjectId, theory_obtained: 90 },
      { exam_id: examId, student_id: failStudentId, subject_id: subjectId, theory_obtained: 10 },
    ])
    await ownerA.from('exam_seat_plans').insert({ exam_id: examId, room_id: roomId, roll_start: 1, roll_end: 2 })
  })

  afterAll(async () => {
    await cleanup(ownerA)
    await cleanup(ownerB)
  })

  it('loadExamRosterResults: computes pass/fail, totals and rank position for the whole roster', async () => {
    const roster = await loadExamRosterResults(ownerA, examId)
    expect(roster).not.toBeNull()
    expect(roster!.rows).toHaveLength(2)

    const pass = roster!.rows.find((r) => r.studentId === passStudentId)!
    const fail = roster!.rows.find((r) => r.studentId === failStudentId)!
    expect(pass.overall?.passed).toBe(true)
    expect(pass.totalObtained).toBe(90)
    expect(pass.rankPosition).toBe(1)
    expect(fail.overall?.passed).toBe(false)
    expect(fail.rankPosition).toBeNull()
  })

  it('loadExamPrintContext: one-student shape matches the roster-wide row for the same student', async () => {
    const ctx = await loadExamPrintContext(ownerA, examId, passStudentId)
    expect(ctx).not.toBeNull()
    expect(ctx!.overall?.passed).toBe(true)
    expect(ctx!.rankPosition).toBe(1)
  })

  it('filterResultRoster: roll range narrows to the matching student', async () => {
    const roster = await loadExamRosterResults(ownerA, examId)
    const filtered = filterResultRoster(
      roster!.rows.map((r) => ({ ...r, passed: r.overall?.passed ?? false })),
      { rollFrom: 2, rollTo: 2, promotedOnly: false },
    )
    expect(filtered).toHaveLength(1)
    expect(filtered[0].studentId).toBe(failStudentId)
  })

  it('filterResultRoster: promotedOnly drops the failed student', async () => {
    const roster = await loadExamRosterResults(ownerA, examId)
    const filtered = filterResultRoster(
      roster!.rows.map((r) => ({ ...r, passed: r.overall?.passed ?? false })),
      { rollFrom: null, rollTo: null, promotedOnly: true },
    )
    expect(filtered).toHaveLength(1)
    expect(filtered[0].studentId).toBe(passStudentId)
  })

  it('admit-card exam center: both rolls resolve to the seat-plan room via roomForRoll', async () => {
    const { data: seatRows } = await ownerA.from('exam_seat_plans').select('room_id, roll_start, roll_end').eq('exam_id', examId)
    const { data: rooms } = await ownerA.from('rooms').select('id, name').eq('id', roomId)
    const roomNameById = new Map((rooms ?? []).map((r) => [r.id, r.name]))
    const seatPlanRoomRows = (seatRows ?? []).map((r) => ({
      roll_start: r.roll_start,
      roll_end: r.roll_end,
      roomName: roomNameById.get(r.room_id) ?? '',
    }))
    expect(roomForRoll(seatPlanRoomRows, 1)).toBe('PA Test Room')
    expect(roomForRoll(seatPlanRoomRows, 2)).toBe('PA Test Room')
    expect(roomForRoll(seatPlanRoomRows, 3)).toBeNull()
  })

  it("RLS: another school's owner can't load this exam's roster at all", async () => {
    const roster = await loadExamRosterResults(ownerB, examId)
    expect(roster).toBeNull()
  })
})
