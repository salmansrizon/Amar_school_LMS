import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// Written for migration 0251 (#703 item 4.7) — NOT RUN (the integration suite
// writes to the shared database). Needs 0218 and 0251 applied.
//
// Seam: student_class_attendance_days refuses a range over 366 days and does
// not count an archived classmate's marks. The fixture Student (Seed Student
// A) must already have a current Enrollment; absent-day-weekly-off.test.ts
// creates it when missing, so run that file first on a fresh database.
//
// 2098-05-04 is a Sunday (2098-03-02 is, per absent-day-weekly-off.test.ts).
const DAY = '2098-05-05' // Monday
const TAG = 'M0251'

describe('student_class_attendance_days range and archived classmates (migration 0251)', () => {
  let owner: SupabaseClient
  let student: SupabaseClient
  let classmate: string

  const taken = async (start: string, end: string) => {
    const { data, error } = await student.rpc('student_class_attendance_days', { p_start: start, p_end: end })
    if (error) throw new Error(error.message)
    return data as string[]
  }
  async function cleanup() {
    const { data } = await owner.from('students').select('id').like('full_name', `${TAG} %`)
    const ids = (data ?? []).map((s) => s.id)
    if (ids.length) {
      await owner.from('attendance_records').delete().in('person_id', ids)
      await owner.from('attendance_absence_notes').delete().in('person_id', ids)
    }
    await owner.from('students').delete().like('full_name', `${TAG} %`)
  }

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    student = await signedIn('s9001@test-a.students.invalid')
    await cleanup()
    const me = (await student.from('student_self').select('id').single()).data!.id
    const { data: meRow } = await owner.from('students').select('current_enrollment_id').eq('id', me).single()
    if (!meRow?.current_enrollment_id) throw new Error('fixture Student has no current Enrollment; see the note above')
    const offering = (
      await owner.from('student_enrollments').select('class_offering_id').eq('id', meRow.current_enrollment_id).single()
    ).data!.class_offering_id

    const { data: made, error } = await owner.from('students').insert({ full_name: `${TAG} Classmate` }).select('id').single()
    if (error) throw new Error(error.message)
    classmate = made!.id
    const admit = await owner.rpc('admit_student_enrollment', {
      p_student_id: classmate,
      p_class_offering_id: offering,
      p_roll_number: null,
      p_note: null,
    })
    if (admit.error) throw new Error(admit.error.message)
    // The classmate is marked present; the caller has no record, so DAY is a
    // taken day on which the caller is absent.
    const mark = await owner.rpc('save_student_attendance', {
      p_att_date: DAY,
      p_records: [{ student_id: classmate, present: true, cause: '' }],
    })
    if (mark.error) throw new Error(mark.error.message)
  })

  afterAll(cleanup)

  it('a month range returns the taken day', async () => {
    expect(await taken('2098-05-01', '2098-05-31')).toContain(DAY)
  })

  it('exactly 366 days is allowed; 367 returns nothing', async () => {
    expect(await taken('2098-01-01', '2099-01-02')).toContain(DAY) // 366 days apart
    expect(await taken('2098-01-01', '2099-01-03')).toEqual([])
  })

  it('a reversed range returns nothing', async () => {
    expect(await taken('2098-05-31', '2098-05-01')).toEqual([])
  })

  it('an archived classmate no longer makes the day taken', async () => {
    const { error } = await owner.from('students').update({ archived_at: new Date().toISOString() }).eq('id', classmate)
    expect(error).toBeNull()
    expect(await taken('2098-05-01', '2098-05-31')).not.toContain(DAY)
  })
})
