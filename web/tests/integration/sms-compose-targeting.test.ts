import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'
import {
  classTargetFromInput,
  resolveClassTargetRecipients,
  COMPOSE_STUDENT_COLUMNS,
  type ComposeStudentRow,
} from '@/lib/sms/recipients'

// issue #595, map #598 Wave 5 (#606) -- SMS compose resolves recipients live
// at send time via each Student's CURRENT Enrollment's Class Offering, using
// the shared Offering-aware predicate. This proves, against the real database:
//   - the COMPOSE_STUDENT_COLUMNS embed actually returns the enrolled
//     Offering's fields PostgREST-side (not just in a unit fixture)
//   - the live "estimated recipients" preview and the actual send resolve
//     through the ONE function (resolveClassTargetRecipients), so an
//     exact-Offering send and a broadcast send both count and send identically
//   - two Offerings sharing a Class name (the #593 shape) are told apart
//
// Mirrors student-matches-target.test.ts's own two-Offerings setup.

const TAG = 'W606'

describe('SMS compose targeting via current Enrollment (#595, #606)', () => {
  let owner: SupabaseClient
  let offeringMorningId: string
  let offeringDayId: string
  let activeYear: number

  async function cleanup() {
    await owner.from('students').delete().like('full_name', `${TAG} %`)
    await owner.from('class_offerings').delete().like('name', `${TAG}%`)
  }

  async function admit(fullName: string, offeringId: string, phone: string | null, roll: number) {
    const { data: student, error } = await owner
      .from('students')
      .insert({ full_name: fullName, student_no: `w606-${Date.now()}-${roll}`, guardian_phone: phone })
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

    const { data: offerings, error } = await owner
      .from('class_offerings')
      .insert([
        { name: `${TAG} Nine`, section: 'A', shift: 'Morning', group_department: 'Science' },
        { name: `${TAG} Nine`, section: 'B', shift: 'Day', group_department: 'Commerce' },
      ])
      .select('id, shift, academic_year')
    if (error) throw new Error(error.message)
    offeringMorningId = offerings!.find((o) => o.shift === 'Morning')!.id
    offeringDayId = offerings!.find((o) => o.shift === 'Day')!.id
    activeYear = offerings![0].academic_year

    await admit(`${TAG} Morning Student`, offeringMorningId, '01700000701', 1)
    await admit(`${TAG} Day Student`, offeringDayId, '01700000702', 1)
    await admit(`${TAG} No Phone Student`, offeringMorningId, null, 2)
  })

  afterAll(cleanup)

  async function composeStudents(): Promise<ComposeStudentRow[]> {
    const { data, error } = await owner
      .from('students')
      .select(COMPOSE_STUDENT_COLUMNS)
      .is('archived_at', null)
      .like('full_name', `${TAG} %`)
    if (error) throw new Error(error.message)
    return (data ?? []) as unknown as ComposeStudentRow[]
  }

  it('exact-Offering target reaches only the enrolled Student (same-name Offering excluded)', async () => {
    const target = classTargetFromInput(
      { scope: 'offering', offeringId: offeringMorningId, className: '', shift: '', groupDepartment: '', section: '' },
      activeYear,
    )
    const recipients = resolveClassTargetRecipients(await composeStudents(), target)
    expect(recipients.map((r) => r.phone).sort()).toEqual(['01700000701'])
  })

  it('broadcast target, all dimensions Any reaches every Student sharing the Class name in the active Year', async () => {
    const target = classTargetFromInput(
      { scope: 'broadcast', offeringId: '', className: `${TAG} Nine`, shift: '', groupDepartment: '', section: '' },
      activeYear,
    )
    const recipients = resolveClassTargetRecipients(await composeStudents(), target)
    expect(recipients.map((r) => r.phone).sort()).toEqual(['01700000701', '01700000702'])
  })

  it('broadcast target narrowed to one Shift reaches only that Shift', async () => {
    const target = classTargetFromInput(
      { scope: 'broadcast', offeringId: '', className: `${TAG} Nine`, shift: 'Day', groupDepartment: '', section: '' },
      activeYear,
    )
    const recipients = resolveClassTargetRecipients(await composeStudents(), target)
    expect(recipients.map((r) => r.phone)).toEqual(['01700000702'])
  })

  it('broadcast pinned to a different Year reaches nobody', async () => {
    const target = classTargetFromInput(
      { scope: 'broadcast', offeringId: '', className: `${TAG} Nine`, shift: '', groupDepartment: '', section: '' },
      activeYear + 1,
    )
    expect(resolveClassTargetRecipients(await composeStudents(), target)).toEqual([])
  })
})
