import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// Written for migration 0259 — NOT RUN (the migration is not applied, and the
// integration suite writes to the shared database). Needs 0218 and 0259.
//
// Seam: a day before a Student was admitted is not an absent working day
// (#703 item 4.8). Asked through absent_working_days_in_range, because 0245
// revoked direct EXECUTE on is_absent_working_day.
//
// The admission day is students.created_at, which a test cannot set, so the
// Students are admitted "now" and the days are taken relative to today
// (Asia/Dhaka, as the function reads it).
const TAG = 'M0259'
const dhakaDay = (offset: number) => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date())
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}

describe('Absent days start at admission (migration 0259)', () => {
  let owner: SupabaseClient
  /** Admitted today, with a current Enrollment. */
  let admitted: string
  /** Created today, never enrolled: keeps the behaviour from before 0259. */
  let unplaced: string

  const absentDays = async (sid: string, start: string, end: string) => {
    const { data, error } = await owner.rpc('absent_working_days_in_range', { p_student: sid, p_start: start, p_end: end })
    if (error) throw new Error(error.message)
    return data as number
  }
  async function cleanup() {
    const { data } = await owner.from('students').select('id').like('full_name', `${TAG} %`)
    const ids = (data ?? []).map((s) => s.id)
    if (ids.length) await owner.from('attendance_records').delete().in('person_id', ids)
    await owner.from('students').delete().like('full_name', `${TAG} %`)
  }

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    await cleanup()
    const { data: made, error } = await owner
      .from('students')
      .insert([{ full_name: `${TAG} Admitted` }, { full_name: `${TAG} Unplaced` }])
      .select('id, full_name')
    if (error) throw new Error(error.message)
    admitted = made!.find((s) => s.full_name === `${TAG} Admitted`)!.id
    unplaced = made!.find((s) => s.full_name === `${TAG} Unplaced`)!.id
    const offering = (
      await owner.from('class_offerings').select('id').eq('name', 'Seed Class').eq('section', 'A').limit(1).single()
    ).data!.id
    const admit = await owner.rpc('admit_student_enrollment', {
      p_student_id: admitted,
      p_class_offering_id: offering,
      p_roll_number: null,
      p_note: null,
    })
    if (admit.error) throw new Error(admit.error.message)
  })

  afterAll(cleanup)

  it('no day before the admission day is an absent working day', async () => {
    expect(await absentDays(admitted, dhakaDay(-28), dhakaDay(-1))).toBe(0)
  })

  it('a Student with no current Enrollment is counted as before', async () => {
    // Four weeks hold working days in any School; the exact figure depends on
    // that School's off-days, so only "not cut off" is asserted.
    expect(await absentDays(unplaced, dhakaDay(-28), dhakaDay(-1))).toBeGreaterThan(0)
  })

  it('from the admission day on, both are counted alike', async () => {
    const start = dhakaDay(0)
    const end = dhakaDay(27)
    const expected = await absentDays(unplaced, start, end)
    expect(expected).toBeGreaterThan(0)
    expect(await absentDays(admitted, start, end)).toBe(expected)
  })

  it('a range across the admission day counts only the days from it', async () => {
    expect(await absentDays(admitted, dhakaDay(-28), dhakaDay(27))).toBe(await absentDays(admitted, dhakaDay(0), dhakaDay(27)))
  })
})
