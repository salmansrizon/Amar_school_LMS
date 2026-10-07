import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn, anonClient } from '../helpers/auth'

// Written for migration 0215 — not run (the integration suite writes to the
// shared database). Needs 0215 applied; before that the weekly off-day cases
// fail and student_class_attendance_days does not exist.
//
// Seam: is_absent_working_day skips schools.weekly_off_days (#703 item 4.0),
// and student_class_attendance_days tells a Student which days attendance was
// taken for their own class (#703 item 4.4).
//
// One fixed week far from any other suite's dates. 2098-03-02 is a Sunday.
const SUN = '2098-03-02'
const MON = '2098-03-03'
const TUE = '2098-03-04'
const WED = '2098-03-05'
const THU = '2098-03-06'
const FRI = '2098-03-07'
const SAT = '2098-03-08'
const WEEK = [SUN, MON, TUE, WED, THU, FRI, SAT]
const TAG = 'M0215'

describe('Absent working day and weekly off-days (migration 0215)', () => {
  let owner: SupabaseClient
  let student: SupabaseClient
  let schoolId: string
  /** The fixture Student with a login (Seed Student A). */
  let me: string
  let myOffering: string
  /** No login; only ever asked about through the owner. */
  let plain: string
  let classmate: string
  let outsider: string
  let originalWeeklyOff: number[]

  const setWeeklyOff = async (days: number[]) => {
    const { error } = await owner.from('schools').update({ weekly_off_days: days }).eq('id', schoolId)
    if (error) throw new Error(error.message)
  }
  const absent = async (sid: string, day: string) => {
    const { data, error } = await owner.rpc('is_absent_working_day', { sid, school: schoolId, d: day })
    if (error) throw new Error(error.message)
    return data as boolean
  }
  const markPresent = async (sid: string, day: string) => {
    const { error } = await owner.rpc('save_student_attendance', {
      p_att_date: day,
      p_records: [{ student_id: sid, present: true, cause: '' }],
    })
    if (error) throw new Error(error.message)
  }
  const takenDays = async () => {
    const { data, error } = await student.rpc('student_class_attendance_days', { p_start: SUN, p_end: SAT })
    if (error) throw new Error(error.message)
    return data as string[]
  }

  async function cleanup() {
    if (me) {
      await owner.from('attendance_records').delete().eq('person_id', me).in('att_date', WEEK)
      await owner.from('student_leaves').delete().eq('student_id', me).gte('from_day', SUN).lte('to_day', SAT)
    }
    await owner.from('off_days').delete().eq('school_id', schoolId).in('day', WEEK)
    // Enrollments go with the Student; attendance rows have no foreign key.
    const { data: mine } = await owner.from('students').select('id').like('full_name', `${TAG} %`)
    const ids = (mine ?? []).map((s) => s.id)
    if (ids.length) {
      await owner.from('attendance_records').delete().in('person_id', ids)
      // No foreign key to students, so these do not go with the Student.
      await owner.from('attendance_absence_notes').delete().in('person_id', ids)
    }
    await owner.from('students').delete().like('full_name', `${TAG} %`)
    await owner.from('class_offerings').delete().like('name', `${TAG}%`)
  }

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    student = await signedIn('s9001@test-a.students.invalid')
    const self = (await student.from('student_self').select('id, school_id').single()).data!
    me = self.id
    schoolId = self.school_id
    await cleanup()

    originalWeeklyOff = (
      await owner.from('schools').select('weekly_off_days').eq('id', schoolId).single()
    ).data!.weekly_off_days
    await setWeeklyOff([5, 6])

    // The fixture Student needs a current Enrollment for the class function.
    // The seed places them by class name only, so admit them once into their
    // own seeded class if nothing has yet. This is left in place afterwards:
    // it is the state the seed describes.
    const { data: meRow } = await owner.from('students').select('current_enrollment_id').eq('id', me).single()
    if (meRow!.current_enrollment_id) {
      myOffering = (
        await owner.from('student_enrollments').select('class_offering_id').eq('id', meRow!.current_enrollment_id).single()
      ).data!.class_offering_id
    } else {
      myOffering = (
        await owner.from('class_offerings').select('id').eq('name', 'Seed Class').eq('section', 'A').limit(1).single()
      ).data!.id
      const { error } = await owner.rpc('admit_student_enrollment', {
        p_student_id: me,
        p_class_offering_id: myOffering,
        p_roll_number: null,
        p_note: null,
      })
      if (error) throw new Error(error.message)
    }

    const { data: other, error: offeringError } = await owner
      .from('class_offerings')
      .insert({ name: `${TAG}-Other`, section: 'A' })
      .select('id')
      .single()
    if (offeringError) throw new Error(offeringError.message)

    const { data: made, error: studentError } = await owner
      .from('students')
      .insert([
        { full_name: `${TAG} Plain` },
        { full_name: `${TAG} Classmate` },
        { full_name: `${TAG} Outsider` },
      ])
      .select('id, full_name')
    if (studentError) throw new Error(studentError.message)
    const idOf = (name: string) => made!.find((s) => s.full_name === `${TAG} ${name}`)!.id as string
    plain = idOf('Plain')
    classmate = idOf('Classmate')
    outsider = idOf('Outsider')

    for (const [sid, offering] of [[classmate, myOffering], [outsider, other!.id]] as const) {
      const { error } = await owner.rpc('admit_student_enrollment', {
        p_student_id: sid,
        p_class_offering_id: offering,
        p_roll_number: null,
        p_note: null,
      })
      if (error) throw new Error(error.message)
    }

    // WED is a school off-day for everyone in these tests.
    const { error: offError } = await owner.from('off_days').insert({ day: WED, label: `${TAG} holiday` })
    if (offError) throw new Error(offError.message)
  })

  afterAll(async () => {
    if (originalWeeklyOff) await setWeeklyOff(originalWeeklyOff)
    await cleanup()
  })

  describe('is_absent_working_day', () => {
    it('a Friday and a Saturday are not absences where weekly_off_days = {5,6}', async () => {
      expect(await absent(plain, FRI)).toBe(false)
      expect(await absent(plain, SAT)).toBe(false)
    })

    it('a weekday with no record still is', async () => {
      expect(await absent(plain, THU)).toBe(true)
      expect(await absent(plain, SUN)).toBe(true)
    })

    it('an off_days row still excuses the day', async () => {
      expect(await absent(plain, WED)).toBe(false)
    })

    it('approved leave still excuses the day; a pending request does not', async () => {
      await owner.from('student_leaves').insert({ student_id: plain, from_day: TUE, to_day: TUE, status: 'pending' })
      expect(await absent(plain, TUE)).toBe(true)
      await owner.from('student_leaves').delete().eq('student_id', plain)
      await owner.from('student_leaves').insert({ student_id: plain, from_day: TUE, to_day: TUE, status: 'approved' })
      expect(await absent(plain, TUE)).toBe(false)
      await owner.from('student_leaves').delete().eq('student_id', plain)
    })

    it('a record on a weekly off-day is still not an absence', async () => {
      await markPresent(plain, SAT)
      expect(await absent(plain, SAT)).toBe(false)
      await owner.from('attendance_records').delete().eq('person_id', plain)
    })

    it('the range count drops the weekly off-days: Sun, Mon, Tue, Thu = 4', async () => {
      const { data, error } = await owner.rpc('absent_working_days_in_range', {
        p_student: plain,
        p_start: SUN,
        p_end: SAT,
      })
      expect(error).toBeNull()
      // Seven days less WED (off_days), FRI and SAT (weekly off-days).
      expect(data).toBe(4)
    })

    it('an empty weekly_off_days skips nothing', async () => {
      await setWeeklyOff([])
      try {
        expect(await absent(plain, FRI)).toBe(true)
        expect(await absent(plain, SAT)).toBe(true)
      } finally {
        await setWeeklyOff([5, 6])
      }
    })

    it('weekly_off_days cannot be null, so the {6} guard in the function is never the live rule', async () => {
      const { error } = await owner.from('schools').update({ weekly_off_days: null }).eq('id', schoolId)
      expect(error).not.toBeNull()
    })
  })

  describe('student_class_attendance_days', () => {
    it('returns the days the caller’s class was marked, and nothing for another class', async () => {
      // The classmate is marked every day but Sunday; only the outsider (a
      // different Class Offering) is marked on Sunday.
      for (const day of [MON, TUE, WED, THU, FRI]) await markPresent(classmate, day)
      await markPresent(outsider, SUN)
      await owner.from('student_leaves').insert({ student_id: me, from_day: TUE, to_day: TUE, status: 'approved' })

      // MON, THU: taken, and working days for the caller.
      // TUE: the caller is on approved leave. WED: off_days. FRI: weekly off.
      // SUN: only another class was marked.
      expect(await takenDays()).toEqual([MON, THU])
    })

    it('a day the caller has their own record is returned even when it is an off-day', async () => {
      await markPresent(me, FRI)
      expect(await takenDays()).toEqual([MON, THU, FRI])
      await owner.from('attendance_records').delete().eq('person_id', me).eq('att_date', FRI)
    })

    it('a day the register was taken by hand with the classmate absent is a taken day', async () => {
      // Absent by hand writes attendance_absence_notes, not attendance_records.
      const { error } = await owner.rpc('save_student_attendance', {
        p_att_date: SUN,
        p_records: [{ student_id: classmate, present: false, cause: '' }],
      })
      expect(error).toBeNull()
      expect(await takenDays()).toEqual([SUN, MON, THU])
    })

    it('gives dates and nothing else', async () => {
      for (const day of await takenDays()) expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('answers nothing to a caller who is not a Student', async () => {
      const { data, error } = await owner.rpc('student_class_attendance_days', { p_start: SUN, p_end: SAT })
      expect(error).toBeNull()
      expect(data).toEqual([])
    })

    it('is closed to anon', async () => {
      const { error } = await anonClient().rpc('student_class_attendance_days', { p_start: SUN, p_end: SAT })
      expect(error).not.toBeNull()
    })
  })
})
