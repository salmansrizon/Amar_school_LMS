import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'
import { schoolAttendanceRate, studentAttendanceRates } from '@/lib/school/attendance-rate-source'

// Seam: student_attendance_summary / school_attendance_summary (0208). Needs
// 0208 applied; until then the reader returns null and these fail loudly.
// Dates sit in January of the current year (window starts 1 Jan; these
// students have no Enrollment, so the window is the whole year to date).
const YEAR = new Date().getUTCFullYear()
const DAYS = [`${YEAR}-01-05`, `${YEAR}-01-06`, `${YEAR}-01-07`]

describe('Attendance Rate summary (0208)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let studentA: string
  let studentA2: string

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    await ownerA.from('students').delete().in('full_name', ['Rate Test Student A', 'Rate Test Student A2'])

    const { data } = await ownerA
      .from('students')
      .insert([{ full_name: 'Rate Test Student A' }, { full_name: 'Rate Test Student A2' }])
      .select('id, full_name')
    studentA = data!.find((s) => s.full_name === 'Rate Test Student A')!.id
    studentA2 = data!.find((s) => s.full_name === 'Rate Test Student A2')!.id

    // A present on days 0 and 1; A2 present on day 2 so day 2 is a school day.
    for (const [day, id] of [[DAYS[0], studentA], [DAYS[1], studentA], [DAYS[2], studentA2]]) {
      const { error } = await ownerA.rpc('save_student_attendance', {
        p_att_date: day,
        p_records: [{ student_id: id, present: true, cause: '' }],
      })
      expect(error).toBeNull()
    }
  })

  afterAll(async () => {
    await ownerA.from('attendance_records').delete().in('person_id', [studentA, studentA2])
    await ownerA.from('students').delete().in('id', [studentA, studentA2])
  })

  it('counts the student’s present days against the school’s days', async () => {
    const rates = await studentAttendanceRates(ownerA)
    expect(rates).not.toBeNull()
    const a = rates!.get(studentA)!
    expect(a.present).toBe(2)
    // Other suites share school A, so it may have more days; never fewer.
    expect(a.schoolDays).toBeGreaterThanOrEqual(3)
    expect(a.rate).toBeLessThan(100)
    expect(rates!.get(studentA2)!.present).toBe(1)
  })

  it('does not return another school’s students', async () => {
    const rates = await studentAttendanceRates(ownerB)
    expect(rates).not.toBeNull()
    expect(rates!.has(studentA)).toBe(false)
    expect(rates!.has(studentA2)).toBe(false)
  })

  it('returns one school-wide row', async () => {
    const school = await schoolAttendanceRate(ownerA)
    expect(school).not.toBeNull()
    expect(school!.present).toBeGreaterThanOrEqual(3)
    expect(school!.schoolDays).toBeGreaterThanOrEqual(school!.present)
  })
})
