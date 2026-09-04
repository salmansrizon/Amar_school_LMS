import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'
import { ensureStaffLogin, linkEmployeeToLogin } from '../helpers/staff'

// Seam: ADR 0018 / migration 0152 — class attachment governs READING, and the
// anchor authorises the reply.
//
// Every assertion here is about what the DATABASE returns, not about what a page
// chose to query. That is the whole point of #508: before 0152 the two queues
// were `school_id = app_current_school_id()` for select, so the scoping lived in
// whichever page happened to filter, and the API did not have it at all.
//
// The four actors, per ADR 0018:
//   owner-a            School Owner        — reads everything, replies to everything
//   teacher-e2e        Class Teacher       — reads/replies for Seed Class A
//   subject-teacher    Subject Teacher     — reads Seed Class A (in its routine),
//                                            replies only on their own anchor
//   office-staff       neither axis        — reads nothing, holds the grants anyway

const P = 'SCOPE '

/** The seed's second teacher (supabase/seed-test.sql) — in Seed Class A's
 *  routine, not its Class Teacher. It ships with no login on purpose; this
 *  suite gives it one. */
const SEED_SUBJECT_EMPLOYEE = '7c000000-7c00-4c00-8c00-7c0000000012'

describe('Question and correction scope (#508, ADR 0018)', () => {
  let owner: SupabaseClient
  let classTeacher: SupabaseClient
  let subjectTeacher: SupabaseClient
  let officeStaff: SupabaseClient
  let student: SupabaseClient
  // Nobody else can clear these tables down: 0148 and 0149 give a School Owner
  // select and update but no delete, because a question is the Student's own
  // record of having asked. Cleanup is the one thing that genuinely needs it.
  let superAdmin: SupabaseClient

  let studentId: string
  let schoolId: string
  /** The subject the Subject Teacher actually teaches, from the seeded routine. */
  let taughtSubjectId: string
  /** A subject in the same school that appears in nobody's routine. */
  let foreignSubjectId: string

  let askedOnTaughtSubject: string
  let askedOnForeignSubject: string

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')

    const subjectProfile = await ensureStaffLogin(owner, {
      email: 'subject-teacher@test.local',
      fullName: 'Seed Subject Teacher',
      screens: ['students', 'classes'],
    })
    await linkEmployeeToLogin(owner, SEED_SUBJECT_EMPLOYEE, subjectProfile)

    // Grants deliberately as wide as the Class Teacher's. If this login still
    // sees nothing, it is the attachment refusing it and not a missing grant.
    await ensureStaffLogin(owner, {
      email: 'office-staff@test.local',
      fullName: 'Seed Office Staff',
      screens: ['students', 'classes', 'fees'],
    })

    classTeacher = await signedIn('teacher-e2e@test.local')
    subjectTeacher = await signedIn('subject-teacher@test.local')
    officeStaff = await signedIn('office-staff@test.local')

    superAdmin = await signedIn('super@test.local')
    student = await signedIn('s9001@test-a.students.invalid')
    const self = (await student.from('student_self').select('id, school_id').single()).data!
    studentId = self.id
    schoolId = self.school_id

    // The subject the routine hands the Subject Teacher — ensured, not assumed.
    // seed-test.sql lays down Sunday–Thursday periods 1–3 for Seed Class A, but
    // other suites in this serial run rewrite that class's routine, so relying on
    // it made this file's result depend on file order. Saturday period 12 is a
    // slot nothing else touches, and both uniqueness constraints on
    // routine_slots — (class, day, period) and (school, day, period, teacher) —
    // are satisfied by it.
    const cls = await owner
      .from('class_offerings')
      .select('id')
      .eq('name', 'Seed Class')
      .eq('section', 'A')
      .limit(1)
      .single()
    if (cls.error) throw new Error(cls.error.message)

    const anySubject = await owner.from('subjects').select('id').limit(1).single()
    if (anySubject.error) throw new Error(anySubject.error.message)
    taughtSubjectId = anySubject.data.id

    const slot = await owner.from('routine_slots').upsert(
      {
        school_id: schoolId,
        class_offering_id: cls.data.id,
        day_of_week: 6,
        period: 12,
        subject_id: taughtSubjectId,
        teacher_id: SEED_SUBJECT_EMPLOYEE,
      },
      { onConflict: 'class_offering_id,day_of_week,period' },
    )
    if (slot.error) throw new Error(slot.error.message)

    // A subject nobody is timetabled against — the colleague's-anchor case.
    await owner.from('subjects').delete().like('name', `${P}%`)
    const foreign = await owner
      .from('subjects')
      .insert({ school_id: schoolId, name: `${P}Untaught`, theory_marks: 100 })
      .select('id')
      .single()
    if (foreign.error) throw new Error(foreign.error.message)
    foreignSubjectId = foreign.data.id

    await superAdmin.from('student_messages').delete().like('subject', `${P}%`)
    // Asked BY the student: 0148 gives staff no insert policy at all, because a
    // question nobody asked is not a question.
    const asked = await student
      .from('student_messages')
      .insert([
        {
          school_id: schoolId,
          student_id: studentId,
          subject_id: taughtSubjectId,
          subject: `${P}About your own subject`,
          body: 'Why is question 4 due Thursday?',
        },
        {
          school_id: schoolId,
          student_id: studentId,
          subject_id: foreignSubjectId,
          subject: `${P}About a colleague's subject`,
          body: 'Same question, different teacher.',
        },
      ])
      .select('id, subject')
    if (asked.error) throw new Error(asked.error.message)
    askedOnTaughtSubject = asked.data.find((m) => m.subject.includes('your own'))!.id
    askedOnForeignSubject = asked.data.find((m) => m.subject.includes('colleague'))!.id
  })

  afterAll(async () => {
    await superAdmin.from('student_messages').delete().like('subject', `${P}%`)
    await superAdmin.from('student_profile_change_requests').delete().like('note', `${P}%`)
    await owner.from('subjects').delete().like('name', `${P}%`)
    await owner.from('publications').delete().like('title', `${P}%`)
  })

  // -------------------------------------------------------------- reading

  it('the School Owner reads every question in the school', async () => {
    const { data } = await owner.from('student_messages').select('id').like('subject', `${P}%`)
    expect(data?.length).toBe(2)
  })

  it('the Class Teacher reads the questions of their own class', async () => {
    const { data } = await classTeacher.from('student_messages').select('id').like('subject', `${P}%`)
    expect(data?.length).toBe(2)
  })

  it('a Subject Teacher reads the questions of a class they teach', async () => {
    // Both of them, including the one anchored to a colleague's subject — reading
    // is class-scoped, and the anchor only governs the reply.
    const { data } = await subjectTeacher.from('student_messages').select('id').like('subject', `${P}%`)
    expect(data?.length).toBe(2)
  })

  it('office staff read nothing, whatever grants they hold', async () => {
    const { data, error } = await officeStaff.from('student_messages').select('id').like('subject', `${P}%`)
    // No rows, not an error: RLS filters, it does not refuse.
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('the teacher inbox view is scoped the same way as the table', async () => {
    // student_message_inbox is security_invoker, so it inherits these policies —
    // asserted rather than assumed, because a definer view would not have.
    const { data } = await officeStaff.from('student_message_inbox').select('id').like('subject', `${P}%`)
    expect(data).toEqual([])
  })

  // -------------------------------------------------------------- replying

  it('a Subject Teacher answers a question anchored to their own subject', async () => {
    const { data, error } = await subjectTeacher
      .from('student_messages')
      .update({ reply_body: 'Because the chapter runs to Wednesday.', status: 'answered' })
      .eq('id', askedOnTaughtSubject)
      .select('id')
    expect(error).toBeNull()
    expect(data?.length).toBe(1)
  })

  it("a Subject Teacher is refused on a colleague's anchor, even though they can read it", async () => {
    // The refusal that makes the anchor rule real. They see this row — it came
    // from a class they teach — and they still may not answer it.
    const visible = await subjectTeacher
      .from('student_messages')
      .select('id')
      .eq('id', askedOnForeignSubject)
    expect(visible.data?.length).toBe(1)

    const { data } = await subjectTeacher
      .from('student_messages')
      .update({ reply_body: 'Not mine to answer.', status: 'answered' })
      .eq('id', askedOnForeignSubject)
      .select('id')
    // An UPDATE the USING clause filters out matches no rows rather than erroring.
    expect(data).toEqual([])

    const after = await owner
      .from('student_messages')
      .select('reply_body')
      .eq('id', askedOnForeignSubject)
      .single()
    expect(after.data?.reply_body).toBeNull()
  })

  it('tells the inbox which questions the caller may answer, matching the policy', async () => {
    // The UI hides a reply box the reply policy would refuse (#509). The set and
    // the policy are two statements of one rule, so this pins them together: if
    // they drift, the page over-offers or under-offers and nothing else notices.
    const forSubjectTeacher = await subjectTeacher.rpc('answerable_message_ids')
    expect(forSubjectTeacher.error).toBeNull()
    const ids = (forSubjectTeacher.data as string[]).map(String)
    expect(ids).toContain(askedOnTaughtSubject)
    expect(ids).not.toContain(askedOnForeignSubject)

    // The Class Teacher may answer both — attachment, not anchor.
    const forClassTeacher = await classTeacher.rpc('answerable_message_ids')
    const classIds = (forClassTeacher.data as string[]).map(String)
    expect(classIds).toEqual(expect.arrayContaining([askedOnTaughtSubject, askedOnForeignSubject]))

    // Office staff are offered nothing, because they may answer nothing.
    const forOffice = await officeStaff.rpc('answerable_message_ids')
    expect(forOffice.data).toEqual([])
  })

  it('the set and the per-row predicate are the same rule, not two copies', async () => {
    // Both the UPDATE policy and answerable_message_ids() call
    // staff_may_answer_message. Asserting they agree row by row is what makes
    // that a single definition rather than a claim in a comment.
    const set = new Set(
      ((await subjectTeacher.rpc('answerable_message_ids')).data as string[]).map(String),
    )
    for (const id of [askedOnTaughtSubject, askedOnForeignSubject]) {
      const { data } = await subjectTeacher.rpc('staff_may_answer_message', { p_message: id })
      expect(data).toBe(set.has(id))
    }
  })

  it('an office clerk who publishes a notice does not thereby read questions about it', async () => {
    // publications.created_by is a LOGIN, so authorship alone says nothing about
    // class attachment (ADR 0018). Without the guard, the `notices` grant would
    // have been a back door into every class's questions.
    const pub = await officeStaff
      .from('publications')
      .insert({
        kind: 'notice',
        title: `${P}Clerk notice`,
        importance: 'normal',
        target_type: 'all',
      })
      .select('id')
      .single()
    if (pub.error) throw new Error(pub.error.message)

    const asked = await student
      .from('student_messages')
      .insert({
        school_id: schoolId,
        student_id: studentId,
        publication_id: pub.data.id,
        subject: `${P}About the clerk's notice`,
        body: 'When does this start?',
      })
      .select('id')
      .single()
    if (asked.error) throw new Error(asked.error.message)

    const seen = await officeStaff.from('student_messages').select('id').eq('id', asked.data.id)
    expect(seen.data).toEqual([])

    const mayAnswer = await officeStaff.rpc('staff_may_answer_message', { p_message: asked.data.id })
    expect(mayAnswer.data).toBe(false)
  })

  it('the Class Teacher answers any question from their own class', async () => {
    const { data, error } = await classTeacher
      .from('student_messages')
      .update({ reply_body: 'I will ask him and come back to you.', status: 'answered' })
      .eq('id', askedOnForeignSubject)
      .select('id')
    expect(error).toBeNull()
    expect(data?.length).toBe(1)
  })

  it('office staff answer nothing', async () => {
    const { data } = await officeStaff
      .from('student_messages')
      .update({ reply_body: 'From the front desk.', status: 'answered' })
      .eq('id', askedOnTaughtSubject)
      .select('id')
    expect(data).toEqual([])
  })

  // --------------------------------------------------- answered invariant

  describe('the answered invariant (0153)', () => {
    it('stamps a reply time when a client marks a question answered without one', async () => {
      // The drift this closes: 0148 grants UPDATE on the table, so any client
      // holding the reply right can PATCH {status:'answered'} and omit the
      // timestamp — as several tests in this repo did, which is how every row in
      // the project came to disagree with itself.
      const { error } = await classTeacher
        .from('student_messages')
        .update({ status: 'answered' })
        .eq('id', askedOnForeignSubject)
      expect(error).toBeNull()

      const { data } = await owner
        .from('student_messages')
        .select('status, replied_at')
        .eq('id', askedOnForeignSubject)
        .single()
      expect(data!.status).toBe('answered')
      expect(data!.replied_at).not.toBeNull()
    })

    it('stamps an INSERT that arrives already answered (0154)', async () => {
      // 0153's trigger was BEFORE UPDATE only, so this path was unguarded.
      // Only a super admin can take it — staff have no insert policy and a
      // Student's is pinned to status='unread' — but the gap was between the
      // trigger and its own stated purpose.
      const inserted = await superAdmin
        .from('student_messages')
        .insert({
          school_id: schoolId,
          student_id: studentId,
          subject_id: taughtSubjectId,
          subject: `${P}Born answered`,
          body: 'inserted already answered',
          status: 'answered',
        })
        .select('id, status, replied_at')
        .single()
      expect(inserted.error).toBeNull()
      expect(inserted.data!.status).toBe('answered')
      expect(inserted.data!.replied_at).not.toBeNull()
    })

    it('refuses a reply time without the matching status', async () => {
      // The half a trigger cannot fix, because there is nothing to infer: a
      // timestamp with a contradicting status is a lie about the row.
      const { error } = await owner
        .from('student_messages')
        .update({ replied_at: new Date().toISOString(), status: 'read' })
        .eq('id', askedOnTaughtSubject)
      expect(error).not.toBeNull()
      expect(error!.message).toMatch(/student_message_reply_is_answered/)
    })

    it('leaves no row in the school disagreeing with itself', async () => {
      // The assertion that was false for 100% of rows before 0153.
      const { data } = await owner.from('student_messages').select('status, replied_at').limit(500)
      const contradictory = (data ?? []).filter((m) => m.replied_at !== null && m.status !== 'answered')
      expect(contradictory).toEqual([])
    })
  })

  // ------------------------------------------------------ correction queue

  describe('correction requests', () => {
    beforeAll(async () => {
      await superAdmin.from('student_profile_change_requests').delete().like('note', `${P}%`)
      const { error } = await student.from('student_profile_change_requests').insert({
        school_id: schoolId,
        student_id: studentId,
        field: 'student_mobile',
        current_value: '01700000000',
        requested_value: '01800000000',
        note: `${P}new number`,
      })
      if (error) throw new Error(error.message)
    })

    it('the Class Teacher reads their own class queue', async () => {
      const { data } = await classTeacher
        .from('student_profile_change_requests')
        .select('id')
        .like('note', `${P}%`)
      expect(data?.length).toBe(1)
    })

    it('a Subject Teacher reads no correction requests at all', async () => {
      // Narrower than the questions queue, deliberately (ADR 0018). A correction
      // is about the child, not about coursework, so there is no anchor to earn
      // his reach — and he could not act on one anyway.
      const { data } = await subjectTeacher
        .from('student_profile_change_requests')
        .select('id')
        .like('note', `${P}%`)
      expect(data).toEqual([])
    })

    it('office staff read nothing', async () => {
      const { data } = await officeStaff
        .from('student_profile_change_requests')
        .select('id')
        .like('note', `${P}%`)
      expect(data).toEqual([])
    })

    it('the school-wide aggregate is closed to office staff too', async () => {
      // The page happened not to show it to them, but the page is not the gate
      // (README: "RLS is the authority ... never as the only gate").
      const { data } = await officeStaff.rpc('school_question_timings', {
        p_from: null,
        p_to: null,
      })
      expect(data).toEqual([])

      // A Class Teacher still gets it — that is what the Σ row is for.
      const forTeacher = await classTeacher.rpc('school_question_timings', {
        p_from: null,
        p_to: null,
      })
      expect((forTeacher.data as unknown[]).length).toBeGreaterThan(0)
    })

    it('applying stays owner-only — attachment widened reading, not acting', async () => {
      const target = (
        await owner.from('student_profile_change_requests').select('id').like('note', `${P}%`).single()
      ).data!
      const { error } = await classTeacher.rpc('apply_profile_change_request', {
        p_request: target.id,
      })
      expect(error).not.toBeNull()
      expect(error!.message).toMatch(/School Owner/i)
    })
  })
})
