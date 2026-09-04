import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn, PASSWORD } from '../helpers/auth'

// Seam: #573/#572/#574 (map #568/#582, Wave 2 / #585) — the three sanctioned
// enrollment-transition primitives: admit_student_enrollment, set_student_enrollment,
// close_student_enrollment. Each is security definer and bypasses RLS on its own
// writes, so each performs its own explicit authorization check — this file is
// that check's evidence, not a re-test of the RLS read/write split already
// covered by class-attachment-scope.test.ts.
const TAG = 'ZZ585'

describe('Enrollment transition primitives (#573/#572/#574, map #568/#582)', () => {
  let owner: SupabaseClient
  let classTeacher: SupabaseClient
  let unattached: SupabaseClient
  let offeringA: string // classTeacher is class_teacher here
  let offeringB: string // classTeacher has no capacity here
  let offeringC: string
  let offeringD: string

  async function cleanup() {
    await owner.from('students').delete().like('full_name', `${TAG} %`)
    await owner.from('class_offerings').delete().like('name', `${TAG}%`)
  }

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    classTeacher = await signedIn('teacher-e2e@test.local', PASSWORD)
    unattached = await signedIn('subject-teacher@test.local', PASSWORD)
    await cleanup()

    const teacherProfile = (await classTeacher.auth.getUser()).data.user!.id
    const { data: employee } = await owner
      .from('employees')
      .select('id')
      .eq('profile_id', teacherProfile)
      .is('archived_at', null)
      .single()

    const { data: offerings, error } = await owner
      .from('class_offerings')
      .insert([
        { name: `${TAG}-A`, section: 'A', class_teacher_id: employee!.id },
        { name: `${TAG}-B`, section: 'A' }, // classTeacher holds no capacity here
        { name: `${TAG}-C`, section: 'A' },
        { name: `${TAG}-D`, section: 'A' },
      ])
      .select('id, name')
    if (error) throw new Error(error.message)
    offeringA = offerings!.find((o) => o.name === `${TAG}-A`)!.id
    offeringB = offerings!.find((o) => o.name === `${TAG}-B`)!.id
    offeringC = offerings!.find((o) => o.name === `${TAG}-C`)!.id
    offeringD = offerings!.find((o) => o.name === `${TAG}-D`)!.id
  })

  afterAll(cleanup)

  async function newStudent(nameSuffix: string) {
    const { data, error } = await owner
      .from('students')
      .insert({ full_name: `${TAG} ${nameSuffix}`, class_name: `${TAG}-A`, section: 'A' })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return data!.id as string
  }

  describe('admit_student_enrollment — Owner/office-staff only (ADR 0021)', () => {
    it('the Owner can admit', async () => {
      const studentId = await newStudent('Admit1')
      const { data, error } = await owner.rpc('admit_student_enrollment', {
        p_student_id: studentId,
        p_class_offering_id: offeringA,
        p_roll_number: null,
        p_note: null,
      })
      expect(error).toBeNull()
      expect(data).toBeTruthy()

      const { data: student } = await owner
        .from('students')
        .select('current_enrollment_id')
        .eq('id', studentId)
        .single()
      expect(student!.current_enrollment_id).toBe(data)
    })

    // ADR 0021: "An Employee cannot admit a student ... Admission is Owner and
    // office work." A Class Teacher holds class_teacher capacity over Offering A
    // (set_student_enrollment would authorize her here) — admit_student_enrollment
    // must refuse her anyway, on a deliberately narrower rule.
    it('a Class Teacher cannot admit, even into her own class', async () => {
      const studentId = await newStudent('Admit2')
      const { error } = await classTeacher.rpc('admit_student_enrollment', {
        p_student_id: studentId,
        p_class_offering_id: offeringA,
        p_roll_number: null,
        p_note: null,
      })
      expect(error).not.toBeNull()
      expect(error!.message).toMatch(/not authorized to admit/)

      const { data: student } = await owner
        .from('students')
        .select('current_enrollment_id')
        .eq('id', studentId)
        .single()
      expect(student!.current_enrollment_id).toBeNull()
    })

    it('refuses to re-admit a student who already has a current enrollment', async () => {
      const studentId = await newStudent('Admit3')
      const { error: setupErr } = await owner.rpc('admit_student_enrollment', {
        p_student_id: studentId,
        p_class_offering_id: offeringA,
        p_roll_number: null,
        p_note: null,
      })
      if (setupErr) throw new Error(setupErr.message)
      const { error } = await owner.rpc('admit_student_enrollment', {
        p_student_id: studentId,
        p_class_offering_id: offeringB,
        p_roll_number: null,
        p_note: null,
      })
      expect(error).not.toBeNull()
      expect(error!.message).toMatch(/already has a current enrollment/)
    })
  })

  describe('set_student_enrollment — authorizes against the TARGET Offering', () => {
    // The Rahim/Offering-A/Offering-B example from #569's resolution: a Class
    // Teacher's capacity over the student's EXISTING Offering must not be what
    // gets checked — only capacity over the Offering being moved TO.
    it('a Class Teacher of the existing Offering cannot move a child into an Offering she does not hold', async () => {
      const studentId = await newStudent('Move1')
      const { error: setupErr } = await owner.rpc('admit_student_enrollment', {
        p_student_id: studentId,
        p_class_offering_id: offeringA,
        p_roll_number: null,
        p_note: null,
      })
      if (setupErr) throw new Error(setupErr.message)

      const { error } = await classTeacher.rpc('set_student_enrollment', {
        p_student_id: studentId,
        p_class_offering_id: offeringB,
        p_roll_number: null,
        p_outcome_for_previous: 'transferred',
        p_note: null,
      })
      expect(error).not.toBeNull()
      expect(error!.message).toMatch(/not authorized for the target class offering/)

      const { data: current } = await owner
        .from('student_enrollments')
        .select('class_offering_id')
        .eq('student_id', studentId)
        .is('closed_at', null)
        .single()
      expect(current!.class_offering_id).toBe(offeringA)
    })

    it('the Owner can transfer, atomically closing the previous enrollment', async () => {
      const studentId = await newStudent('Move2')
      const { data: firstId, error: setupErr } = await owner.rpc('admit_student_enrollment', {
        p_student_id: studentId,
        p_class_offering_id: offeringA,
        p_roll_number: 5,
        p_note: null,
      })
      if (setupErr) throw new Error(setupErr.message)

      const { data: secondId, error } = await owner.rpc('set_student_enrollment', {
        p_student_id: studentId,
        p_class_offering_id: offeringB,
        p_roll_number: 9,
        p_outcome_for_previous: 'transferred',
        p_note: 'guardian request',
      })
      expect(error).toBeNull()

      const { data: rows } = await owner
        .from('student_enrollments')
        .select('id, class_offering_id, closed_at, outcome, roll_number')
        .eq('student_id', studentId)
        .order('created_at')
      expect(rows).toHaveLength(2)
      const previous = rows!.find((r) => r.id === firstId)!
      const current = rows!.find((r) => r.id === secondId)!
      expect(previous.closed_at).not.toBeNull()
      expect(previous.outcome).toBe('transferred')
      expect(current.closed_at).toBeNull()
      expect(current.outcome).toBeNull()
      expect(current.class_offering_id).toBe(offeringB)
      expect(current.roll_number).toBe(9)

      const { data: student } = await owner
        .from('students')
        .select('current_enrollment_id')
        .eq('id', studentId)
        .single()
      expect(student!.current_enrollment_id).toBe(secondId)
    })

    // #573 Q4: the row lock serializes two concurrent transitions for the SAME
    // student rather than letting them race. Both calls here are individually
    // authorized (Owner), so both succeed — but the invariant under test is that
    // the pair can never leave the student with zero or two current enrollments,
    // whichever call the lock lets go second.
    it('two concurrent transitions for the same student never produce two current enrollments', async () => {
      const studentId = await newStudent('Move3')
      const { error: setupErr } = await owner.rpc('admit_student_enrollment', {
        p_student_id: studentId,
        p_class_offering_id: offeringA,
        p_roll_number: null,
        p_note: null,
      })
      // Unchecked, this setup admission could silently fail — since
      // set_student_enrollment tolerates a null current_enrollment_id (it just
      // skips the close-previous branch), both racing calls below would still
      // succeed and land on exactly one current enrollment, passing every
      // assertion below without ever exercising the close-then-insert race
      // this test exists to cover.
      if (setupErr) throw new Error(setupErr.message)

      const [r1, r2] = await Promise.all([
        owner.rpc('set_student_enrollment', {
          p_student_id: studentId,
          p_class_offering_id: offeringC,
          p_roll_number: null,
          p_outcome_for_previous: 'transferred',
          p_note: 'race-1',
        }),
        owner.rpc('set_student_enrollment', {
          p_student_id: studentId,
          p_class_offering_id: offeringD,
          p_roll_number: null,
          p_outcome_for_previous: 'transferred',
          p_note: 'race-2',
        }),
      ])
      expect(r1.error).toBeNull()
      expect(r2.error).toBeNull()

      const { data: current } = await owner
        .from('student_enrollments')
        .select('id, class_offering_id')
        .eq('student_id', studentId)
        .is('closed_at', null)
      expect(current).toHaveLength(1)

      const { data: student } = await owner
        .from('students')
        .select('current_enrollment_id')
        .eq('id', studentId)
        .single()
      expect(student!.current_enrollment_id).toBe(current![0].id)
      // Whichever call the lock let commit second, its target Offering is the one
      // that stuck — both are legitimate outcomes, only a split result is not.
      expect([offeringC, offeringD]).toContain(current![0].class_offering_id)
    })
  })

  describe('close_student_enrollment — authorizes against the CLOSING Offering (Leaving has no target)', () => {
    it('an actor unattached to the closing Offering cannot close it', async () => {
      const studentId = await newStudent('Leave1')
      const { error: setupErr } = await owner.rpc('admit_student_enrollment', {
        p_student_id: studentId,
        p_class_offering_id: offeringA,
        p_roll_number: null,
        p_note: null,
      })
      if (setupErr) throw new Error(setupErr.message)

      const { error } = await unattached.rpc('close_student_enrollment', {
        p_student_id: studentId,
        p_note: 'left the school',
      })
      expect(error).not.toBeNull()
      expect(error!.message).toMatch(/not authorized for the closing class offering/)

      const { data: student } = await owner
        .from('students')
        .select('current_enrollment_id')
        .eq('id', studentId)
        .single()
      expect(student!.current_enrollment_id).not.toBeNull()
    })

    it('the Class Teacher of the closing Offering can close it', async () => {
      const studentId = await newStudent('Leave2')
      const { data: enrollmentId, error: setupErr } = await owner.rpc('admit_student_enrollment', {
        p_student_id: studentId,
        p_class_offering_id: offeringA,
        p_roll_number: null,
        p_note: null,
      })
      if (setupErr) throw new Error(setupErr.message)

      const { error } = await classTeacher.rpc('close_student_enrollment', {
        p_student_id: studentId,
        p_note: 'left the school',
      })
      expect(error).toBeNull()

      const { data: student } = await owner
        .from('students')
        .select('current_enrollment_id')
        .eq('id', studentId)
        .single()
      expect(student!.current_enrollment_id).toBeNull()

      const { data: closed } = await owner
        .from('student_enrollments')
        .select('closed_at, outcome, note')
        .eq('id', enrollmentId)
        .single()
      expect(closed!.closed_at).not.toBeNull()
      expect(closed!.outcome).toBe('left')
      expect(closed!.note).toBe('left the school')
    })

    it('refuses a student with no current enrollment', async () => {
      const studentId = await newStudent('Leave3')
      const { error } = await owner.rpc('close_student_enrollment', {
        p_student_id: studentId,
        p_note: null,
      })
      expect(error).not.toBeNull()
      expect(error!.message).toMatch(/no current enrollment to close/)
    })
  })

  // Caught by this wave's own code review: the students write policy places no
  // restriction on which columns may change, so current_enrollment_id was
  // settable by a plain client UPDATE, entirely bypassing every function above.
  describe('current_enrollment_id is settable only through the three transition primitives', () => {
    it('a direct UPDATE of current_enrollment_id is refused, even by an actor with write capacity on the row', async () => {
      const studentId = await newStudent('Bypass1')
      const { error: setupErr } = await owner.rpc('admit_student_enrollment', {
        p_student_id: studentId,
        p_class_offering_id: offeringA,
        p_roll_number: null,
        p_note: null,
      })
      if (setupErr) throw new Error(setupErr.message)

      // classTeacher holds class_teacher capacity over offeringA, so the
      // ordinary students write policy's USING/WITH CHECK both pass — only
      // the new trigger stands between this and a bypassed transition.
      const { error } = await classTeacher.from('students').update({ current_enrollment_id: null }).eq('id', studentId)
      expect(error).not.toBeNull()
      expect(error!.message).toMatch(/may only be (set|changed) by/)

      const { data: student } = await owner
        .from('students')
        .select('current_enrollment_id')
        .eq('id', studentId)
        .single()
      expect(student!.current_enrollment_id).not.toBeNull()
    })

    it('a fresh INSERT cannot pre-set current_enrollment_id to someone else’s enrollment', async () => {
      const existing = await newStudent('Bypass2')
      const { data: existingEnrollmentId, error: setupErr } = await owner.rpc('admit_student_enrollment', {
        p_student_id: existing,
        p_class_offering_id: offeringA,
        p_roll_number: null,
        p_note: null,
      })
      if (setupErr) throw new Error(setupErr.message)

      // Two independent guards both refuse this, and either firing first is a
      // correct outcome: the belt-and-suspenders consistency trigger (it can
      // never belong to a not-yet-existing student) and the transition-only
      // trigger (it wasn't set by a sanctioned function) would each reject it
      // alone.
      const { error } = await owner
        .from('students')
        .insert({
          full_name: `${TAG} Bypass3`,
          class_name: `${TAG}-A`,
          section: 'A',
          current_enrollment_id: existingEnrollmentId,
        })
      expect(error).not.toBeNull()
      expect(error!.message).toMatch(/may only be (set|changed) by|must reference an enrollment belonging to this student/)
    })
  })

  // Roll numbering on Enrollments (issue #586, migration 0181) — the port of
  // assign_student_roll/students_roll_unique. The backstop constrains CURRENT
  // placements only: `students` held one row per Student, so a roll vacated by
  // a promotion or transfer had always been reusable, and an index copied
  // across without a closed_at filter would have quietly outlawed that.
  describe('roll numbers are scoped to a Class Offering, and freed when an Enrollment closes', () => {
    it('auto-assigns the next roll within the Offering', async () => {
      const first = await newStudent('Roll1')
      const second = await newStudent('Roll2')
      for (const id of [first, second]) {
        const { error } = await owner.rpc('admit_student_enrollment', {
          p_student_id: id,
          p_class_offering_id: offeringC,
          p_roll_number: null,
          p_note: null,
        })
        if (error) throw new Error(error.message)
      }

      const { data: rolls } = await owner
        .from('student_enrollments')
        .select('roll_number')
        .eq('class_offering_id', offeringC)
        .is('closed_at', null)
        .order('roll_number')
      expect(rolls!.map((r) => r.roll_number)).toEqual([1, 2])
    })

    it('refuses two OPEN enrollments sharing a roll in one Offering', async () => {
      const first = await newStudent('Dup1')
      const second = await newStudent('Dup2')
      const { error: firstErr } = await owner.rpc('admit_student_enrollment', {
        p_student_id: first,
        p_class_offering_id: offeringD,
        p_roll_number: 7,
        p_note: null,
      })
      if (firstErr) throw new Error(firstErr.message)

      const { error } = await owner.rpc('admit_student_enrollment', {
        p_student_id: second,
        p_class_offering_id: offeringD,
        p_roll_number: 7,
        p_note: null,
      })
      expect(error).not.toBeNull()
      expect(error!.message).toMatch(/student_enrollments_roll_unique|duplicate key/)
    })

    // The case a history-spanning unique index would have broken: promoting a
    // class out of an Offering and then admitting into it again at the same
    // rolls is ordinary, and used to work because the old model simply
    // overwrote students.roll_number.
    it('frees a roll once the Enrollment holding it is closed', async () => {
      const leaver = await newStudent('Freed1')
      const { error: admitErr } = await owner.rpc('admit_student_enrollment', {
        p_student_id: leaver,
        p_class_offering_id: offeringB,
        p_roll_number: 3,
        p_note: null,
      })
      if (admitErr) throw new Error(admitErr.message)

      const { error: closeErr } = await owner.rpc('close_student_enrollment', {
        p_student_id: leaver,
        p_note: 'left',
      })
      if (closeErr) throw new Error(closeErr.message)

      const arrival = await newStudent('Freed2')
      const { error } = await owner.rpc('admit_student_enrollment', {
        p_student_id: arrival,
        p_class_offering_id: offeringB,
        p_roll_number: 3,
        p_note: null,
      })
      expect(error).toBeNull()
    })
  })

  // Caught by this wave's own code review: admit_student_enrollment never
  // checked the target Offering's school, unlike set_student_enrollment and
  // close_student_enrollment (both gated through staff_capacity_for_class_offering).
  describe('admit_student_enrollment refuses a cross-school class_offering_id', () => {
    it('refuses to admit a student into another school’s Offering', async () => {
      const otherOwner = await signedIn('owner-b@test.local')
      const { data: theirOffering, error: theirsErr } = await otherOwner
        .from('class_offerings')
        .insert({ name: `${TAG}-OtherSchool`, section: 'A' })
        .select('id')
        .single()
      if (theirsErr) throw new Error(theirsErr.message)

      const studentId = await newStudent('CrossSchool')
      const { error } = await owner.rpc('admit_student_enrollment', {
        p_student_id: studentId,
        p_class_offering_id: theirOffering!.id,
        p_roll_number: null,
        p_note: null,
      })
      expect(error).not.toBeNull()
      expect(error!.message).toMatch(/does not belong to this school/)

      await otherOwner.from('class_offerings').delete().eq('id', theirOffering!.id)
    })
  })
})
