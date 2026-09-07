import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn, PASSWORD } from '../helpers/auth'
import { ensureStaffLogin, linkEmployeeToLogin } from '../helpers/staff'
import { loadExamRosterResults } from '@/lib/exam-print-data'

// Seam: issue #593 (map #582's follow-up) — class_offerings' widened
// uniqueness key (name/section/shift/academic_year/group_department, all
// NULLS NOT DISTINCT) plus the two live consumers that had to move off
// (name, section) text resolution *before* that widening could ship safely:
// class_teacher_profile_for (notification routing) and the "school members
// write students" RLS policy's own with_check (Class Teacher write access).
//
// Both fixes are proven here against the EXACT scenario that would have
// broken them: two Class Offerings sharing a name+section, differing only
// by Shift, each with its own Class Teacher — precisely what the widened
// constraint newly permits.

const TAG = 'W593'

describe('Widened class_offerings uniqueness (#593)', () => {
  let owner: SupabaseClient

  async function cleanup() {
    await owner.from('students').delete().like('full_name', `${TAG} %`)
    await owner.from('class_offerings').delete().like('name', `${TAG}%`)
  }

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    await cleanup()
  })

  afterAll(cleanup)

  it('a duplicate name+section+shift+year+group is still refused', async () => {
    const { error: first } = await owner
      .from('class_offerings')
      .insert({ name: `${TAG} Dup`, section: 'A' })
    expect(first).toBeNull()
    const { error: second } = await owner
      .from('class_offerings')
      .insert({ name: `${TAG} Dup`, section: 'A' })
    expect(second).not.toBeNull()
    expect(second!.code).toBe('23505')
  })

  it('the same name+section now coexists across different Shifts', async () => {
    const { error: morning } = await owner
      .from('class_offerings')
      .insert({ name: `${TAG} Shift`, section: 'A', shift: 'Morning' })
    expect(morning).toBeNull()
    const { error: day } = await owner
      .from('class_offerings')
      .insert({ name: `${TAG} Shift`, section: 'A', shift: 'Day' })
    expect(day).toBeNull()
  })

  it('the same name+section now coexists across different Group Departments', async () => {
    const { error: science } = await owner
      .from('class_offerings')
      .insert({ name: `${TAG} Group`, section: 'A', group_department: 'Science' })
    expect(science).toBeNull()
    const { error: commerce } = await owner
      .from('class_offerings')
      .insert({ name: `${TAG} Group`, section: 'A', group_department: 'Commerce' })
    expect(commerce).toBeNull()
  })

  it('the same name+section now coexists across different Academic Years', async () => {
    const { error: y1 } = await owner
      .from('class_offerings')
      .insert({ name: `${TAG} Year`, section: 'A', academic_year: 2026 })
    expect(y1).toBeNull()
    const { error: y2 } = await owner
      .from('class_offerings')
      .insert({ name: `${TAG} Year`, section: 'A', academic_year: 2027 })
    expect(y2).toBeNull()
  })

  it('a No-Shift School still refuses a duplicate on name+section alone (NULLS NOT DISTINCT preserved)', async () => {
    const { error: first } = await owner
      .from('class_offerings')
      .insert({ name: `${TAG} NullShift`, section: 'A', shift: null })
    expect(first).toBeNull()
    const { error: second } = await owner
      .from('class_offerings')
      .insert({ name: `${TAG} NullShift`, section: 'A', shift: null })
    expect(second).not.toBeNull()
    expect(second!.code).toBe('23505')
  })
})

describe('class_teacher_profile_for resolves by Enrollment, not text (#593)', () => {
  let owner: SupabaseClient
  let offeringMorningId: string
  let offeringDayId: string
  let morningTeacherProfile: string
  let dayTeacherProfile: string
  let studentLoginEmail: string

  async function cleanup() {
    await owner.from('students').delete().like('full_name', `${TAG} %`)
    await owner.from('employees').delete().like('full_name', `${TAG} %`)
    // exams.class_id is ON DELETE SET NULL, not CASCADE (unlike
    // class_routines/class_syllabi/routine_slots) — deleting class_offerings
    // alone orphans same-named exam rows instead of removing them, colliding
    // with the next run's insert of the identical name. Delete explicitly.
    await owner.from('exams').delete().like('name', `${TAG} %`)
    await owner.from('subjects').delete().like('name', `${TAG} %`)
    await owner.from('class_offerings').delete().like('name', `${TAG}%`)
  }

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    await cleanup()

    morningTeacherProfile = await ensureStaffLogin(owner, {
      email: 'w593-morning@test.local',
      fullName: `${TAG} Morning Teacher`,
      screens: ['students'],
    })
    dayTeacherProfile = await ensureStaffLogin(owner, {
      email: 'w593-day@test.local',
      fullName: `${TAG} Day Teacher`,
      screens: ['students'],
    })

    const { data: empMorning, error: empMorningErr } = await owner
      .from('employees')
      .insert({ full_name: `${TAG} Morning Teacher` })
      .select('id')
      .single()
    if (empMorningErr) throw new Error(empMorningErr.message)
    await linkEmployeeToLogin(owner, empMorning!.id, morningTeacherProfile)

    const { data: empDay, error: empDayErr } = await owner
      .from('employees')
      .insert({ full_name: `${TAG} Day Teacher` })
      .select('id')
      .single()
    if (empDayErr) throw new Error(empDayErr.message)
    await linkEmployeeToLogin(owner, empDay!.id, dayTeacherProfile)

    // Two Offerings, identical name+section, differing only by Shift — the
    // exact coexistence the widened constraint now permits, and the exact
    // shape that would have made the old (name, section) + limit 1
    // resolution ambiguous.
    const { data: offerings, error: offeringsErr } = await owner
      .from('class_offerings')
      .insert([
        { name: `${TAG} Nine`, section: 'A', shift: 'Morning', class_teacher_id: empMorning!.id },
        { name: `${TAG} Nine`, section: 'A', shift: 'Day', class_teacher_id: empDay!.id },
      ])
      .select('id, shift')
    if (offeringsErr) throw new Error(offeringsErr.message)
    offeringMorningId = offerings!.find((o) => o.shift === 'Morning')!.id
    offeringDayId = offerings!.find((o) => o.shift === 'Day')!.id

    // One subject per Offering — proves student_subject_option (0192) keeps
    // them apart by Enrollment, not the shared name+section text.
    // theory_marks > 0 to satisfy subjects_marks_nonzero (marks all default
    // to 0, whose sum fails that CHECK).
    const { error: subjectsErr } = await owner.from('subjects').insert([
      { name: `${TAG} Morning Subject`, class_id: offeringMorningId, theory_marks: 100 },
      { name: `${TAG} Day Subject`, class_id: offeringDayId, theory_marks: 100 },
    ])
    if (subjectsErr) throw new Error(subjectsErr.message)

    // Explicit, run-unique student_no: create_student_login's derived
    // address is deterministic from it, and deleting the students row (this
    // file's own cleanup) leaks the auth.users row behind that address —
    // a documented trade-off (0068, #436), no service-role key to delete
    // one with. A rerun would otherwise collide with its own last run's
    // orphan.
    const { data: student, error: studentErr } = await owner
      .from('students')
      .insert({ full_name: `${TAG} Morning Student`, student_no: `w593-${Date.now()}` })
      .select('id')
      .single()
    if (studentErr) throw new Error(studentErr.message)
    const { error: admitErr } = await owner.rpc('admit_student_enrollment', {
      p_student_id: student!.id,
      p_class_offering_id: offeringMorningId,
      p_roll_number: null,
      p_note: null,
    })
    if (admitErr) throw new Error(admitErr.message)

    // A real login, so the RPC can be called AS this Student — the whole
    // point is proving auth.uid()'s own resolution, not just the data shape.
    const { data: email, error: loginErr } = await owner.rpc('create_student_login', {
      p_student_id: student!.id,
      p_password: PASSWORD,
    })
    if (loginErr) throw new Error(loginErr.message)

    // Fixtures for the other three views 0192 fixed — one distinguishable
    // row per Offering, same shape as this codebase's own existing
    // student-routine/student-exam-schedule/student-materials suites.
    await owner.from('class_routines').insert([
      { class_id: offeringMorningId, published_at: new Date().toISOString() },
      { class_id: offeringDayId, published_at: new Date().toISOString() },
    ])
    const { data: subjectRows } = await owner
      .from('subjects')
      .select('id, class_id')
      .in('class_id', [offeringMorningId, offeringDayId])
    const morningSubjectId = subjectRows!.find((s) => s.class_id === offeringMorningId)!.id
    const daySubjectId = subjectRows!.find((s) => s.class_id === offeringDayId)!.id
    await owner.from('routine_slots').insert([
      { class_offering_id: offeringMorningId, day_of_week: 0, period: 1, subject_id: morningSubjectId },
      { class_offering_id: offeringDayId, day_of_week: 0, period: 1, subject_id: daySubjectId },
    ])

    const { data: exams, error: examsErr } = await owner
      .from('exams')
      .insert([
        { name: `${TAG} Morning Exam`, exam_year: 2026, class_id: offeringMorningId },
        { name: `${TAG} Day Exam`, exam_year: 2026, class_id: offeringDayId },
      ])
      .select('id, class_id')
    if (examsErr) throw new Error(examsErr.message)
    const morningExamId = exams!.find((e) => e.class_id === offeringMorningId)!.id
    const dayExamId = exams!.find((e) => e.class_id === offeringDayId)!.id
    const { error: entriesErr } = await owner.from('exam_routine_entries').insert([
      { exam_id: morningExamId, subject_id: morningSubjectId, exam_date: '2099-11-20', start_time: '10:00', end_time: '13:00' },
      { exam_id: dayExamId, subject_id: daySubjectId, exam_date: '2099-11-21', start_time: '10:00', end_time: '13:00' },
    ])
    if (entriesErr) throw new Error(entriesErr.message)

    const { error: syllabiErr } = await owner.from('class_syllabi').insert([
      { class_id: offeringMorningId, storage_path: `${TAG}/morning.pdf`, file_name: `${TAG} Morning Syllabus` },
      { class_id: offeringDayId, storage_path: `${TAG}/day.pdf`, file_name: `${TAG} Day Syllabus` },
    ])
    if (syllabiErr) throw new Error(syllabiErr.message)
    studentLoginEmail = email as string
  })

  afterAll(cleanup)

  it('resolves the calling Student to her OWN class teacher, not the other same-name-section Offering', async () => {
    const studentSession = await signedIn(studentLoginEmail, PASSWORD)
    const { data, error } = await studentSession.rpc('class_teacher_profile_for')
    expect(error).toBeNull()
    // Must be the Morning teacher's profile — the Student's real Enrollment
    // — never the Day teacher's, even though both Offerings share the exact
    // same name+section the old text resolution could not tell apart.
    expect(data).toBe(morningTeacherProfile)
    expect(data).not.toBe(dayTeacherProfile)
  })

  it("student_subject_option (0192) shows only the Student's own Offering's subjects, not the other shift's — the cross-class mixing found by code review", async () => {
    const studentSession = await signedIn(studentLoginEmail, PASSWORD)
    const { data, error } = await studentSession.from('student_subject_option').select('name')
    expect(error).toBeNull()
    const names = (data ?? []).map((s) => s.name)
    expect(names).toContain(`${TAG} Morning Subject`)
    expect(names).not.toContain(`${TAG} Day Subject`)
  })

  it("student_routine (0192) shows only the Student's own Offering's routine, not the other shift's", async () => {
    const studentSession = await signedIn(studentLoginEmail, PASSWORD)
    const { data, error } = await studentSession.from('student_routine').select('subject_name')
    expect(error).toBeNull()
    const names = (data ?? []).map((r) => r.subject_name)
    expect(names).toContain(`${TAG} Morning Subject`)
    expect(names).not.toContain(`${TAG} Day Subject`)
  })

  it("student_exam_routine (0192) shows only the Student's own Offering's exam schedule, not the other shift's", async () => {
    const studentSession = await signedIn(studentLoginEmail, PASSWORD)
    const { data, error } = await studentSession.from('student_exam_routine').select('exam_name')
    expect(error).toBeNull()
    const names = (data ?? []).map((r) => r.exam_name)
    expect(names).toContain(`${TAG} Morning Exam`)
    expect(names).not.toContain(`${TAG} Day Exam`)
  })

  it("student_material's syllabus branch (0192) shows only the Student's own Offering's syllabus, not the other shift's", async () => {
    const studentSession = await signedIn(studentLoginEmail, PASSWORD)
    const { data, error } = await studentSession.from('student_material').select('title').eq('source', 'syllabus')
    expect(error).toBeNull()
    const titles = (data ?? []).map((m) => m.title)
    expect(titles).toContain(`${TAG} Morning Syllabus`)
    expect(titles).not.toContain(`${TAG} Day Syllabus`)
  })

  it("a Student reading class_offerings directly (0193) sees only her own Offering, not the other shift's row", async () => {
    const studentSession = await signedIn(studentLoginEmail, PASSWORD)
    const { data, error } = await studentSession.from('class_offerings').select('id').eq('name', `${TAG} Nine`)
    expect(error).toBeNull()
    const ids = (data ?? []).map((c) => c.id)
    expect(ids).toContain(offeringMorningId)
    expect(ids).not.toContain(offeringDayId)
  })

  it('the two Offerings really do share the ambiguous name+section (the precondition this fix defends against)', async () => {
    const { data } = await owner
      .from('class_offerings')
      .select('id, shift')
      .eq('name', `${TAG} Nine`)
      .eq('section', 'A')
    expect(data).toHaveLength(2)
    expect(data!.map((o) => o.shift).sort()).toEqual(['Day', 'Morning'])
  })
})

describe("students write-policy resolves Class Teacher capacity by Enrollment, not text (#593)", () => {
  let owner: SupabaseClient
  let teacherMorning: SupabaseClient
  let teacherDay: SupabaseClient
  let offeringMorningId: string
  let offeringDayId: string
  let studentInMorningId: string
  let studentInDayId: string

  async function cleanup() {
    await owner.from('students').delete().like('full_name', `${TAG}W %`)
    await owner.from('employees').delete().like('full_name', `${TAG}W %`)
    await owner.from('class_offerings').delete().like('name', `${TAG}W%`)
  }

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    await cleanup()

    const morningProfile = await ensureStaffLogin(owner, {
      email: 'w593w-morning@test.local',
      fullName: `${TAG}W Morning Teacher`,
      screens: ['students'],
    })
    const dayProfile = await ensureStaffLogin(owner, {
      email: 'w593w-day@test.local',
      fullName: `${TAG}W Day Teacher`,
      screens: ['students'],
    })

    const { data: empMorning } = await owner
      .from('employees')
      .insert({ full_name: `${TAG}W Morning Teacher` })
      .select('id')
      .single()
    await linkEmployeeToLogin(owner, empMorning!.id, morningProfile)

    const { data: empDay } = await owner
      .from('employees')
      .insert({ full_name: `${TAG}W Day Teacher` })
      .select('id')
      .single()
    await linkEmployeeToLogin(owner, empDay!.id, dayProfile)

    const { data: offerings } = await owner
      .from('class_offerings')
      .insert([
        { name: `${TAG}W Nine`, section: 'A', shift: 'Morning', class_teacher_id: empMorning!.id },
        { name: `${TAG}W Nine`, section: 'A', shift: 'Day', class_teacher_id: empDay!.id },
      ])
      .select('id, shift')
    offeringMorningId = offerings!.find((o) => o.shift === 'Morning')!.id
    offeringDayId = offerings!.find((o) => o.shift === 'Day')!.id

    const { data: students } = await owner
      .from('students')
      .insert([
        { full_name: `${TAG}W Morning Student` },
        { full_name: `${TAG}W Day Student` },
      ])
      .select('id, full_name')
    studentInMorningId = students!.find((s) => s.full_name.includes('Morning'))!.id
    studentInDayId = students!.find((s) => s.full_name.includes('Day'))!.id

    await owner.rpc('admit_student_enrollment', {
      p_student_id: studentInMorningId,
      p_class_offering_id: offeringMorningId,
      p_roll_number: null,
      p_note: null,
    })
    await owner.rpc('admit_student_enrollment', {
      p_student_id: studentInDayId,
      p_class_offering_id: offeringDayId,
      p_roll_number: null,
      p_note: null,
    })

    teacherMorning = await signedIn('w593w-morning@test.local', PASSWORD)
    teacherDay = await signedIn('w593w-day@test.local', PASSWORD)
  })

  afterAll(cleanup)

  it('the Morning teacher can edit her own (Morning) Student', async () => {
    const { error } = await teacherMorning
      .from('students')
      .update({ full_name: `${TAG}W Morning Student` })
      .eq('id', studentInMorningId)
    expect(error).toBeNull()
  })

  // Note: for an ordinary profile-edit UPDATE, USING and WITH CHECK are
  // structurally equivalent here — current_enrollment_id never changes via
  // this write path, so both clauses resolve the same (Student, Offering)
  // pair. This proves the end-to-end write is correctly blocked; the
  // WITH CHECK-specific fix (0190) is isolated instead by the raw-insert
  // test below, where there is no USING clause to confound it.
  it("the Morning teacher CANNOT edit the Day teacher's Student, even though both share the Offering's name+section (the exact bug this migration closes)", async () => {
    const { data, error } = await teacherMorning
      .from('students')
      .update({ full_name: `${TAG}W Day Student` })
      .eq('id', studentInDayId)
      .select('id')
    // RLS silently filters rather than erroring: zero rows affected.
    expect(error).toBeNull()
    expect(data ?? []).toEqual([])
    const { data: unchanged } = await owner.from('students').select('full_name').eq('id', studentInDayId).single()
    expect(unchanged?.full_name).toBe(`${TAG}W Day Student`)
  })

  it('the Day teacher can edit her own (Day) Student and not the Morning one', async () => {
    const ok = await teacherDay
      .from('students')
      .update({ full_name: `${TAG}W Day Student` })
      .eq('id', studentInDayId)
      .select('id')
    expect(ok.error).toBeNull()
    expect(ok.data).toHaveLength(1)

    const blocked = await teacherDay
      .from('students')
      .update({ full_name: `${TAG}W Morning Student` })
      .eq('id', studentInMorningId)
      .select('id')
    expect(blocked.error).toBeNull()
    expect(blocked.data ?? []).toEqual([])
  })

  it('a Class Teacher cannot raw-insert a new Student directly (current_enrollment_id is null at insert time — ADR 0021 side effect, confirmed with the user before shipping)', async () => {
    const { data, error } = await teacherMorning
      .from('students')
      .insert({ full_name: `${TAG}W Raw Insert Attempt` })
      .select('id')
    expect(error).not.toBeNull()
    expect(data ?? []).toEqual([])
  })
})

describe('loadExamRosterResults resolves by Enrollment, not text (issue #593, found by code review)', () => {
  let owner: SupabaseClient
  let offeringMorningId: string
  let offeringDayId: string
  let studentInMorningId: string
  let studentInDayId: string
  let examMorningId: string

  const TAGX = 'W593X'

  async function cleanup() {
    await owner.from('students').delete().like('full_name', `${TAGX} %`)
    await owner.from('exams').delete().like('name', `${TAGX} %`)
    await owner.from('grading_schemes').delete().like('name', `${TAGX} %`)
    await owner.from('class_offerings').delete().like('name', `${TAGX}%`)
  }

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    await cleanup()

    const { data: offerings } = await owner
      .from('class_offerings')
      .insert([
        { name: `${TAGX} Nine`, section: 'A', shift: 'Morning' },
        { name: `${TAGX} Nine`, section: 'A', shift: 'Day' },
      ])
      .select('id, shift')
    offeringMorningId = offerings!.find((o) => o.shift === 'Morning')!.id
    offeringDayId = offerings!.find((o) => o.shift === 'Day')!.id

    const { data: students } = await owner
      .from('students')
      .insert([
        { full_name: `${TAGX} Morning Student`, roll_number: 1 },
        { full_name: `${TAGX} Day Student`, roll_number: 1 },
      ])
      .select('id, full_name')
    studentInMorningId = students!.find((s) => s.full_name.includes('Morning'))!.id
    studentInDayId = students!.find((s) => s.full_name.includes('Day'))!.id

    await owner.rpc('admit_student_enrollment', {
      p_student_id: studentInMorningId,
      p_class_offering_id: offeringMorningId,
      p_roll_number: 1,
      p_note: null,
    })
    await owner.rpc('admit_student_enrollment', {
      p_student_id: studentInDayId,
      p_class_offering_id: offeringDayId,
      p_roll_number: 1,
      p_note: null,
    })

    const { data: scheme } = await owner
      .from('grading_schemes')
      .insert({ name: `${TAGX} Scheme`, scheme_type: 'letter', pass_mark_percent: 33, pass_rule_strategy: 'individual' })
      .select('id')
      .single()
    await owner.from('grade_bands').insert({ grading_scheme_id: scheme!.id, label: 'Pass', min_percent: 33, max_percent: 100 })
    await owner.from('subjects').insert([
      { name: `${TAGX} Subject`, class_id: offeringMorningId, theory_marks: 100 },
      { name: `${TAGX} Subject`, class_id: offeringDayId, theory_marks: 100 },
    ])

    const { data: exam } = await owner
      .from('exams')
      .insert({ name: `${TAGX} Morning Exam`, exam_year: 2026, class_id: offeringMorningId, grading_scheme_id: scheme!.id })
      .select('id')
      .single()
    examMorningId = exam!.id
  })

  afterAll(cleanup)

  it("the Morning exam's roster includes the Morning Student, not the Day Student, though both share the Offering's name+section", async () => {
    const roster = await loadExamRosterResults(owner, examMorningId)
    expect(roster).not.toBeNull()
    const studentIds = roster!.rows.map((r) => r.studentId)
    expect(studentIds).toContain(studentInMorningId)
    expect(studentIds).not.toContain(studentInDayId)
  })
})
