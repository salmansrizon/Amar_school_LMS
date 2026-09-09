import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'
import { enrolledStudentIds } from '@/lib/school/offering-roster'

// issue #596 — the shared roster primitive every Exam / Fees / bulk-Login
// site now resolves through. The bug it fixes: since #593 two Class Offerings
// can share a name+section (a Morning and a Day "W596 Nine - A"), so a
// students.class_name/section text match returns BOTH shifts' students on one
// exam roster / fee list / login batch. enrolledStudentIds must return only
// the Students whose CURRENT (open) Enrollment is in the exact Offering asked
// for. Mirrors student-matches-target.test.ts's own two-Offerings fixture.

const TAG = 'W596'

describe('enrolledStudentIds (#596)', () => {
  let owner: SupabaseClient
  let offeringMorningId: string
  let offeringDayId: string
  let stuMorningId: string
  let stuDayId: string
  let stuUnenrolledId: string

  async function cleanup() {
    await owner.from('students').delete().like('full_name', `${TAG} %`)
    await owner.from('class_offerings').delete().like('name', `${TAG}%`)
  }

  async function admit(fullName: string, offeringId: string, roll: number): Promise<string> {
    const { data: student, error } = await owner
      .from('students')
      .insert({ full_name: fullName, student_no: `w596-${Date.now()}-${roll}` })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    const { error: admitErr } = await owner.rpc('admit_student_enrollment', {
      p_student_id: student!.id,
      p_class_offering_id: offeringId,
      p_roll_number: roll,
      p_note: null,
    })
    if (admitErr) throw new Error(admitErr.message)
    return student!.id
  }

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    await cleanup()

    // Same name + section, differ only by Shift — the #593 coexistence.
    const { data: offerings, error } = await owner
      .from('class_offerings')
      .insert([
        { name: `${TAG} Nine`, section: 'A', shift: 'Morning' },
        { name: `${TAG} Nine`, section: 'A', shift: 'Day' },
      ])
      .select('id, shift')
    if (error) throw new Error(error.message)
    offeringMorningId = offerings!.find((o) => o.shift === 'Morning')!.id
    offeringDayId = offerings!.find((o) => o.shift === 'Day')!.id

    stuMorningId = await admit(`${TAG} Morning Student`, offeringMorningId, 1)
    stuDayId = await admit(`${TAG} Day Student`, offeringDayId, 1)

    // A Student who carries the legacy class_name/section text but has no
    // current Enrollment — the old text match would have swept them in.
    const { data: unenrolled, error: uErr } = await owner
      .from('students')
      .insert({
        full_name: `${TAG} Text Only Student`,
        student_no: `w596-textonly-${Date.now()}`,
        class_name: `${TAG} Nine`,
        section: 'A',
      })
      .select('id')
      .single()
    if (uErr) throw new Error(uErr.message)
    stuUnenrolledId = unenrolled!.id
  })

  afterAll(cleanup)

  it('returns only the Students enrolled in the exact Offering, not a same-name-section one on another Shift', async () => {
    const morning = await enrolledStudentIds(owner, offeringMorningId)
    expect(morning).toContain(stuMorningId)
    expect(morning).not.toContain(stuDayId)
    expect(morning).not.toContain(stuUnenrolledId)

    const day = await enrolledStudentIds(owner, offeringDayId)
    expect(day).toContain(stuDayId)
    expect(day).not.toContain(stuMorningId)
    expect(day).not.toContain(stuUnenrolledId)
  })

  it('returns an empty list for an Offering with no current Enrollments', async () => {
    const { data: empty, error } = await owner
      .from('class_offerings')
      .insert({ name: `${TAG} Empty`, section: 'Z' })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    expect(await enrolledStudentIds(owner, empty!.id)).toEqual([])
  })

  it('drops a Student once their Enrollment in this Offering is closed (transferred out)', async () => {
    const { data: other, error } = await owner
      .from('class_offerings')
      .insert({ name: `${TAG} Nine`, section: 'B', shift: 'Morning' })
      .select('id')
      .single()
    if (error) throw new Error(error.message)

    expect(await enrolledStudentIds(owner, offeringMorningId)).toContain(stuMorningId)
    // set_student_enrollment closes the old Enrollment and opens the new one.
    const { error: moveErr } = await owner.rpc('set_student_enrollment', {
      p_student_id: stuMorningId,
      p_class_offering_id: other!.id,
      p_roll_number: 2,
      p_outcome_for_previous: 'transferred',
      p_note: null,
    })
    if (moveErr) throw new Error(moveErr.message)

    expect(await enrolledStudentIds(owner, offeringMorningId)).not.toContain(stuMorningId)
    expect(await enrolledStudentIds(owner, other!.id)).toContain(stuMorningId)
  })
})
