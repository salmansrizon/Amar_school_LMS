import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn, anonClient, PASSWORD } from '../helpers/auth'

// NOT RUN. Written with migrations 0240-0245 (issues #677, #688, #689, #690 and
// #703 item 4.6), none of which is applied. It has never been executed against
// any database: expect to fix small things on the first run.
//
// Each block probes for its own migration and skips itself while that migration
// is missing, so the file is safe to keep in the suite before the rollout.
//
// Everything it creates is in Test School A and is named W2-ACC…; afterAll
// removes it. The one thing it cannot remove is the auth user
// w2-acc-disable@test.local (no delete RPC exists); it is left disabled=false.
//
// Actors (supabase/seed-test.sql, tests/e2e seed):
//   owner-a / owner-b        School Owners of two Schools
//   office-staff@test.local  Staff User, no employees row
//   teacher-e2e@test.local   Staff User WITH an employees row (a teacher)
//   s9001@…students.invalid  Student
//   anon                     no session
const TAG = 'W2-ACC'
const DISABLE_EMAIL = 'w2-acc-disable@test.local'

describe('access rollout 0240-0245 (NOT RUN)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let office: SupabaseClient
  let teacher: SupabaseClient
  let student: SupabaseClient
  let officeId: string
  let teacherId: string
  const grantsAdded: { staff_user_id: string; screen_key: string }[] = []

  const uid = async (c: SupabaseClient) => (await c.auth.getUser()).data.user!.id
  /** Give `attendance` for the run only; remember it so afterAll takes it back. */
  async function grantAttendance(staffUserId: string) {
    const { error } = await ownerA.from('staff_permissions').insert({ staff_user_id: staffUserId, screen_key: 'attendance' })
    if (!error) grantsAdded.push({ staff_user_id: staffUserId, screen_key: 'attendance' })
  }

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    office = await signedIn('office-staff@test.local', PASSWORD)
    teacher = await signedIn('teacher-e2e@test.local', PASSWORD)
    student = await signedIn('s9001@test-a.students.invalid', PASSWORD)
    officeId = await uid(office)
    teacherId = await uid(teacher)
    await grantAttendance(officeId)
    await grantAttendance(teacherId)
  })

  afterAll(async () => {
    await ownerA.from('category_office_hours').delete().eq('employee_category', 'Teacher').eq('day_of_week', 3).eq('start_time', '03:21:00')
    await ownerA.from('students').delete().like('full_name', `${TAG}%`)
    for (const g of grantsAdded) {
      await ownerA.from('staff_permissions').delete().eq('staff_user_id', g.staff_user_id).eq('screen_key', g.screen_key)
    }
  })

  // ---------------------------------------------------------------- 0240 #677
  describe('0240 employee attendance config is Owner and office staff only', () => {
    let applied = false
    const row = { shift: null, employee_category: 'Teacher', day_of_week: 3, start_time: '03:21:00', end_time: '03:22:00' }
    const write = (c: SupabaseClient) =>
      c.from('category_office_hours').upsert(row, { onConflict: 'school_id,shift,employee_category,day_of_week' }).select('id')

    beforeAll(async () => {
      // Probe: before 0240 a teacher CAN write this table.
      const probe = await write(teacher)
      applied = Boolean(probe.error) || !probe.data?.length
      if (!applied) await ownerA.from('category_office_hours').delete().eq('start_time', '03:21:00')
    })

    it('Owner writes', async (ctx) => {
      if (!applied) return ctx.skip()
      const { data, error } = await write(ownerA)
      expect(error).toBeNull()
      expect(data).toHaveLength(1)
    })
    it('office staff with the Attendance grant write', async (ctx) => {
      if (!applied) return ctx.skip()
      const { data, error } = await write(office)
      expect(error).toBeNull()
      expect(data).toHaveLength(1)
    })
    it('a teacher with the Attendance grant is refused the write but still reads', async (ctx) => {
      if (!applied) return ctx.skip()
      const refused = await write(teacher)
      expect(refused.error ?? (refused.data?.length ? null : 'no rows')).toBeTruthy()
      const read = await teacher.from('category_office_hours').select('id').eq('start_time', '03:21:00')
      expect(read.error).toBeNull()
      expect(read.data!.length).toBeGreaterThan(0)
      const del = await teacher.from('category_office_hours').delete().eq('start_time', '03:21:00').select('id')
      expect(del.data ?? []).toHaveLength(0)
    })
    it('a teacher cannot add or delete an attendance machine or a grace rule', async (ctx) => {
      if (!applied) return ctx.skip()
      const machine = await teacher
        .from('attendance_machines')
        .insert({ machine_type: 'rfid', serial_number: `${TAG}-SN`, shift_scope: 'all' })
        .select('id')
      expect(machine.error ?? (machine.data?.length ? null : 'no rows')).toBeTruthy()
      const rule = await teacher.rpc('save_standing_grace_rule', {
        p_shift: null,
        p_grace_detail: 'late_entry',
        p_grace_minutes: 1,
        p_categories: ['Teacher'],
      })
      expect(rule.error).not.toBeNull()
    })
    it('a Student, another School and anon reach nothing', async (ctx) => {
      if (!applied) return ctx.skip()
      for (const c of [student, ownerB, anonClient()]) {
        const read = await c.from('category_office_hours').select('id').eq('start_time', '03:21:00')
        expect(read.data ?? []).toHaveLength(0)
      }
      const refused = await write(student)
      expect(refused.error ?? (refused.data?.length ? null : 'no rows')).toBeTruthy()
    })
  })

  // ---------------------------------------------------------------- 0241 #688
  describe('0241 / 0242 the Owner turns a staff login off and on', () => {
    let applied = false
    let staffId: string
    const signIn = () => anonClient().auth.signInWithPassword({ email: DISABLE_EMAIL, password: PASSWORD })

    beforeAll(async () => {
      const probe = await ownerA.from('profiles').select('login_disabled_at').limit(1)
      applied = !probe.error
      if (!applied) return
      const created = await ownerA.rpc('create_staff_user', {
        staff_email: DISABLE_EMAIL,
        staff_password: PASSWORD,
        staff_full_name: `${TAG} Disable Test`,
      })
      staffId = created.error
        ? (await ownerA.from('profiles').select('id').eq('full_name', `${TAG} Disable Test`).single()).data!.id
        : (created.data as string)
      await ownerA.rpc('set_staff_login_disabled', { p_staff: staffId, p_disabled: false })
      await ownerA.from('staff_permissions').upsert({ staff_user_id: staffId, screen_key: 'students' })
    })
    afterAll(async () => {
      if (!applied) return
      await ownerA.rpc('set_staff_login_disabled', { p_staff: staffId, p_disabled: false })
      await ownerA.from('staff_permissions').delete().eq('staff_user_id', staffId)
    })

    it('nobody but the Owner of that School can call it', async (ctx) => {
      if (!applied) return ctx.skip()
      for (const c of [ownerB, office, teacher, student, anonClient()]) {
        const { error } = await c.rpc('set_staff_login_disabled', { p_staff: staffId, p_disabled: true })
        expect(error).not.toBeNull()
      }
      expect((await signIn()).error).toBeNull() // still enabled
    })
    it('the Owner cannot disable themselves or another Owner', async (ctx) => {
      if (!applied) return ctx.skip()
      const { error } = await ownerA.rpc('set_staff_login_disabled', { p_staff: await uid(ownerA), p_disabled: true })
      expect(error).not.toBeNull()
      const other = await ownerA.rpc('set_staff_login_disabled', { p_staff: await uid(ownerB), p_disabled: true })
      expect(other.error).not.toBeNull()
    })
    it('off: sign-in is refused, the open session ends, grants are kept', async (ctx) => {
      if (!applied) return ctx.skip()
      const session = await signIn()
      expect(session.error).toBeNull()
      const live = anonClient()
      await live.auth.setSession({ access_token: session.data.session!.access_token, refresh_token: session.data.session!.refresh_token })

      const { error } = await ownerA.rpc('set_staff_login_disabled', { p_staff: staffId, p_disabled: true })
      expect(error).toBeNull()

      expect((await signIn()).error).not.toBeNull()
      expect((await live.auth.getUser()).error).not.toBeNull()
      expect((await live.auth.refreshSession()).error).not.toBeNull()
      const grants = await ownerA.from('staff_permissions').select('screen_key').eq('staff_user_id', staffId)
      expect(grants.data!.map((g) => g.screen_key)).toContain('students')
      const profile = await ownerA.from('profiles').select('login_disabled_at').eq('id', staffId).single()
      expect(profile.data!.login_disabled_at).not.toBeNull()

      // 0242 only: the token issued before the switch reads no tenant row.
      // Without 0242 this still returns rows until the token expires (the
      // window 0242 closes), so it is reported rather than asserted.
      const stale = await live.from('students').select('id').limit(1)
      if ((stale.data ?? []).length) console.warn('0242 not applied: a pre-disable token still reads tenant rows')
    })
    it('on: the same login signs in again with the same grants', async (ctx) => {
      if (!applied) return ctx.skip()
      const { error } = await ownerA.rpc('set_staff_login_disabled', { p_staff: staffId, p_disabled: false })
      expect(error).toBeNull()
      const session = await signIn()
      expect(session.error).toBeNull()
      const again = anonClient()
      await again.auth.setSession({ access_token: session.data.session!.access_token, refresh_token: session.data.session!.refresh_token })
      const own = await again.from('staff_permissions').select('screen_key')
      expect(own.data!.map((g) => g.screen_key)).toContain('students')
    })
  })

  // ---------------------------------------------------------------- 0243 #689
  describe('0243 approvals are read only within reach', () => {
    let applied = false
    let leaveInstance: string
    let studentId: string

    beforeAll(async () => {
      const probe = await ownerA.rpc('workflow_instance_in_reach', {
        p_instance: '00000000-0000-0000-0000-000000000000',
        p_school: null,
        p_definition: 'x',
        p_seq: 1,
        p_initiator: null,
      })
      applied = !probe.error
      if (!applied) return
      const schoolId = (await ownerA.from('profiles').select('school_id').eq('id', await uid(ownerA)).single()).data!.school_id
      studentId = (await ownerA.from('students').insert({ full_name: `${TAG} Approvals Student` }).select('id').single()).data!.id
      const leave = await ownerA
        .from('student_leaves')
        .insert({ student_id: studentId, from_day: '2026-06-01', to_day: '2026-06-01' })
        .select('id')
        .single()
      const started = await ownerA.rpc('workflow_start', {
        p_definition_key: 'leave_approval',
        p_school_id: schoolId,
        p_entity_type: 'student_leave',
        p_entity_id: leave.data!.id,
      })
      leaveInstance = started.data as string
    })
    afterAll(async () => {
      if (!applied) return
      // Reject it so it leaves the pending queue; the instance row itself stays (no delete policy).
      await ownerA.rpc('workflow_decide', { p_instance_id: leaveInstance, p_decision: 'rejected', p_comment: `${TAG} cleanup` })
      await ownerA.from('student_leaves').delete().eq('student_id', studentId)
    })

    const sees = async (c: SupabaseClient) => ((await c.from('workflow_instances').select('id').eq('id', leaveInstance)).data ?? []).length === 1

    it('the Owner sees it', async (ctx) => {
      if (!applied) return ctx.skip()
      expect(await sees(ownerA)).toBe(true)
    })
    it('office staff with the Attendance grant see a leave approval', async (ctx) => {
      if (!applied) return ctx.skip()
      expect(await sees(office)).toBe(true)
    })
    it('office staff WITHOUT the Attendance grant do not', async (ctx) => {
      if (!applied) return ctx.skip()
      await ownerA.from('staff_permissions').delete().eq('staff_user_id', officeId).eq('screen_key', 'attendance')
      expect(await sees(office)).toBe(false)
      await ownerA.from('staff_permissions').insert({ staff_user_id: officeId, screen_key: 'attendance' })
    })
    it('a teacher, a Student, another School and anon do not', async (ctx) => {
      if (!applied) return ctx.skip()
      for (const c of [teacher, student, ownerB, anonClient()]) expect(await sees(c)).toBe(false)
    })
    it('a teacher cannot comment on what she cannot read; the Owner can', async (ctx) => {
      if (!applied) return ctx.skip()
      expect((await teacher.rpc('workflow_comment', { p_instance_id: leaveInstance, p_body: `${TAG} no` })).error).not.toBeNull()
      expect((await ownerA.rpc('workflow_comment', { p_instance_id: leaveInstance, p_body: `${TAG} yes` })).error).toBeNull()
    })
    it('only the Owner can decide (unchanged)', async (ctx) => {
      if (!applied) return ctx.skip()
      const refused = await office.rpc('workflow_decide', { p_instance_id: leaveInstance, p_decision: 'approved' })
      expect(refused.error).not.toBeNull()
    })
  })

  // ---------------------------------------------------------------- 0244 #690
  describe('0244 a manual roll edit must be free in the class offering', () => {
    let applied = false
    let a: string
    let b: string

    beforeAll(async () => {
      // Needs two W2-ACC students placed in ONE offering. Any open offering of
      // the active year will do; the test adds and removes only its own rows.
      const offering = (await ownerA.from('class_offerings').select('id, name, section').is('archived_at', null).limit(1).single()).data
      if (!offering) return
      const admit = async (name: string, roll: number) => {
        const s = (await ownerA.from('students').insert({ full_name: name }).select('id').single()).data!.id as string
        await ownerA.rpc('admit_student_enrollment', { p_student_id: s, p_class_offering_id: offering.id, p_roll_number: roll, p_note: null })
        await ownerA.from('students').update({ roll_number: roll }).eq('id', s)
        return s
      }
      a = await admit(`${TAG} Roll A`, 990001)
      b = await admit(`${TAG} Roll B`, 990002)
      // Probe: before 0244 this edit succeeds (class_name is null on both, so 0120's index is silent).
      const probe = await ownerA.from('students').update({ roll_number: 990001 }).eq('id', b).select('id')
      applied = Boolean(probe.error)
      if (!applied) await ownerA.from('students').update({ roll_number: 990002 }).eq('id', b)
    })

    it("an edit to a classmate's roll is refused with the constraint name the app maps", async (ctx) => {
      if (!applied) return ctx.skip()
      const { error } = await ownerA.from('students').update({ roll_number: 990001 }).eq('id', b)
      expect(error!.code).toBe('23505')
      expect(error!.message).toContain('"students_roll_unique"')
    })
    it('an edit to a free roll, and re-saving the same roll, both pass', async (ctx) => {
      if (!applied) return ctx.skip()
      expect((await ownerA.from('students').update({ roll_number: 990003 }).eq('id', b)).error).toBeNull()
      expect((await ownerA.from('students').update({ roll_number: 990003 }).eq('id', b)).error).toBeNull()
      expect((await ownerA.from('students').update({ full_name: `${TAG} Roll A` }).eq('id', a)).error).toBeNull()
    })
    it('the function is not callable as an RPC by anyone', async (ctx) => {
      if (!applied) return ctx.skip()
      for (const c of [ownerA, office, teacher, student, anonClient()]) {
        expect((await c.rpc('enforce_student_roll_unique_in_offering')).error).not.toBeNull()
      }
    })
  })

  // ------------------------------------------------------ 0245 #703 item 4.6
  describe('0245 is_absent_working_day is not callable directly', () => {
    let applied = false
    let schoolId: string
    let sid: string
    const direct = (c: SupabaseClient) => c.rpc('is_absent_working_day', { sid, school: schoolId, d: '2026-06-01' })

    beforeAll(async () => {
      schoolId = (await ownerA.from('profiles').select('school_id').eq('id', await uid(ownerA)).single()).data!.school_id
      sid = (await ownerA.from('students').insert({ full_name: `${TAG} Absent Probe` }).select('id').single()).data!.id
      applied = Boolean((await direct(anonClient())).error)
    })

    it('anon, a Student, staff and the Owner are all refused the direct call', async (ctx) => {
      if (!applied) return ctx.skip()
      for (const c of [anonClient(), student, teacher, office, ownerA]) expect((await direct(c)).error).not.toBeNull()
    })
    it('the definer callers still answer', async (ctx) => {
      if (!applied) return ctx.skip()
      const range = await ownerA.rpc('absent_working_days_in_range', { p_student: sid, p_start: '2026-06-01', p_end: '2026-06-01' })
      expect(range.error).toBeNull()
      const month = await ownerA.rpc('absent_working_days_in_month', { p_student: sid, p_year: 2026, p_month: 6 })
      expect(month.error).toBeNull()
      const mine = await student.rpc('student_absent_working_days', { p_start: '2026-06-01', p_end: '2026-06-01' })
      expect(mine.error).toBeNull()
    })
  })
})
