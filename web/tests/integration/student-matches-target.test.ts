import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn, PASSWORD } from '../helpers/auth'

// issue #595, map #598 Wave 2 (#603) -- student_matches_target() backs the
// Student-facing RLS SELECT policy on publications: this is the actual
// authorization boundary, so these are real RLS tests against real sessions,
// not unit tests of a pure function. Mirrors wave593-uniqueness-and-
// routing.test.ts's own two-Offerings-sharing-a-name-and-section shape --
// the exact scenario this whole map exists to keep correct.

const TAG = 'W603'

describe('student_matches_target() / Student RLS on publications (#595, #603)', () => {
  let owner: SupabaseClient
  let offeringMorningId: string
  let offeringDayId: string
  let studentMorningEmail: string
  let studentDayEmail: string

  async function cleanup() {
    await owner.from('students').delete().like('full_name', `${TAG} %`)
    await owner.from('publications').delete().like('title', `${TAG} %`)
    await owner.from('class_offerings').delete().like('name', `${TAG}%`)
  }

  async function admitAndLogin(fullName: string, offeringId: string, rollNumber: number): Promise<string> {
    const { data: student, error: studentErr } = await owner
      .from('students')
      .insert({ full_name: fullName, student_no: `w603-${Date.now()}-${rollNumber}` })
      .select('id')
      .single()
    if (studentErr) throw new Error(studentErr.message)
    const { error: admitErr } = await owner.rpc('admit_student_enrollment', {
      p_student_id: student!.id,
      p_class_offering_id: offeringId,
      p_roll_number: rollNumber,
      p_note: null,
    })
    if (admitErr) throw new Error(admitErr.message)
    const { data: email, error: loginErr } = await owner.rpc('create_student_login', {
      p_student_id: student!.id,
      p_password: PASSWORD,
    })
    if (loginErr) throw new Error(loginErr.message)
    return email as string
  }

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    await cleanup()

    // Two Offerings, identical name+section, differing only by Shift -- the
    // exact coexistence #593 permits and the shape every consumer of
    // publication targeting must resolve correctly, not by chance.
    const { data: offerings, error: offeringsErr } = await owner
      .from('class_offerings')
      .insert([
        { name: `${TAG} Nine`, section: 'A', shift: 'Morning', group_department: 'Science' },
        { name: `${TAG} Nine`, section: 'A', shift: 'Day', group_department: 'Commerce' },
      ])
      .select('id, shift')
    if (offeringsErr) throw new Error(offeringsErr.message)
    offeringMorningId = offerings!.find((o) => o.shift === 'Morning')!.id
    offeringDayId = offerings!.find((o) => o.shift === 'Day')!.id

    studentMorningEmail = await admitAndLogin(`${TAG} Morning Student`, offeringMorningId, 1)
    studentDayEmail = await admitAndLogin(`${TAG} Day Student`, offeringDayId, 1)
  })

  afterAll(cleanup)

  async function canRead(email: string, publicationId: string): Promise<boolean> {
    const session = await signedIn(email, PASSWORD)
    const { data } = await session.from('publications').select('id').eq('id', publicationId)
    return (data ?? []).some((r) => r.id === publicationId)
  }

  it('exact-Offering target: the enrolled Student can read it, a Student in the same-name-section-different-Shift Offering cannot', async () => {
    const { data: pub, error } = await owner
      .from('publications')
      .insert({
        kind: 'notice',
        title: `${TAG} Exact Offering Notice`,
        target_type: 'specific',
        target_scope: 'offering',
        class_offering_id: offeringMorningId,
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)

    expect(await canRead(studentMorningEmail, pub!.id)).toBe(true)
    expect(await canRead(studentDayEmail, pub!.id)).toBe(false)
  })

  it('broadcast target, Any Shift: both same-name-section-different-Shift Students can read it', async () => {
    const { data: year } = await owner.from('class_offerings').select('academic_year').eq('id', offeringMorningId).single()
    const { data: pub, error } = await owner
      .from('publications')
      .insert({
        kind: 'notice',
        title: `${TAG} Broadcast Any Shift Notice`,
        target_type: 'specific',
        target_scope: 'broadcast',
        target_class_name: `${TAG} Nine`,
        target_academic_year: year!.academic_year,
        target_section: 'A',
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)

    expect(await canRead(studentMorningEmail, pub!.id)).toBe(true)
    expect(await canRead(studentDayEmail, pub!.id)).toBe(true)
  })

  it('broadcast target, a specific Shift: only the matching-Shift Student can read it', async () => {
    const { data: year } = await owner.from('class_offerings').select('academic_year').eq('id', offeringMorningId).single()
    const { data: pub, error } = await owner
      .from('publications')
      .insert({
        kind: 'notice',
        title: `${TAG} Broadcast Morning-Only Notice`,
        target_type: 'specific',
        target_scope: 'broadcast',
        target_class_name: `${TAG} Nine`,
        target_academic_year: year!.academic_year,
        target_shift: 'Morning',
        target_section: 'A',
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)

    expect(await canRead(studentMorningEmail, pub!.id)).toBe(true)
    expect(await canRead(studentDayEmail, pub!.id)).toBe(false)
  })

  it('broadcast target, a specific Group Department: only the matching-Group Student can read it', async () => {
    const { data: year } = await owner.from('class_offerings').select('academic_year').eq('id', offeringMorningId).single()
    const { data: pub, error } = await owner
      .from('publications')
      .insert({
        kind: 'notice',
        title: `${TAG} Broadcast Science-Only Notice`,
        target_type: 'specific',
        target_scope: 'broadcast',
        target_class_name: `${TAG} Nine`,
        target_academic_year: year!.academic_year,
        target_group_department: 'Science',
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)

    expect(await canRead(studentMorningEmail, pub!.id)).toBe(true)
    expect(await canRead(studentDayEmail, pub!.id)).toBe(false)
  })

  it('deleting the exact-Offering target nulls class_offering_id and the publication becomes unresolvable to any Student', async () => {
    // Deliberately no Student ever enrolled in this Offering:
    // student_enrollments.class_offering_id has no ON DELETE behavior of its
    // own -- an Offering with any real (even closed) Enrollment can never be
    // deleted at all, enrolled or not, so testing the SET NULL path needs an
    // Offering nothing has ever enrolled in, matching the one real-world case
    // a Class Offering delete can actually succeed against (a stale, unused
    // row) -- see #599's resolution.
    const { data: throwaway, error: throwawayErr } = await owner
      .from('class_offerings')
      .insert({ name: `${TAG} Throwaway`, section: 'Z' })
      .select('id')
      .single()
    if (throwawayErr) throw new Error(throwawayErr.message)

    const { data: pub, error } = await owner
      .from('publications')
      .insert({
        kind: 'notice',
        title: `${TAG} Deleted Offering Notice`,
        target_type: 'specific',
        target_scope: 'offering',
        class_offering_id: throwaway!.id,
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    // Targeted at an Offering neither of the fixture Students belongs to --
    // correctly unreadable by either, before the Offering is ever touched.
    expect(await canRead(studentMorningEmail, pub!.id)).toBe(false)
    expect(await canRead(studentDayEmail, pub!.id)).toBe(false)

    const { error: deleteErr } = await owner.from('class_offerings').delete().eq('id', throwaway!.id)
    if (deleteErr) throw new Error(deleteErr.message)

    const { data: afterDelete } = await owner.from('publications').select('class_offering_id').eq('id', pub!.id).single()
    expect(afterDelete!.class_offering_id).toBeNull()
    // Still unreadable by everyone -- the publication survives (history-safe,
    // per #599), but resolves to nobody now that its target Offering is gone.
    expect(await canRead(studentMorningEmail, pub!.id)).toBe(false)
    expect(await canRead(studentDayEmail, pub!.id)).toBe(false)
  })

  it("a school-wide (target_scope='all') publication is readable by every Student regardless of Offering", async () => {
    const { data: pub, error } = await owner
      .from('publications')
      .insert({ kind: 'notice', title: `${TAG} All Students Notice`, target_type: 'all' })
      .select('id')
      .single()
    if (error) throw new Error(error.message)

    expect(await canRead(studentMorningEmail, pub!.id)).toBe(true)
    expect(await canRead(studentDayEmail, pub!.id)).toBe(true)
  })

  it("an UNENROLLED Student (no current Enrollment at all) can still read a school-wide (target_scope='all') publication -- #569's own 'unplaced is a valid, visible state' guarantee, preserved by 0188 and now this rewrite", async () => {
    // Deliberately no admit_student_enrollment call -- current_enrollment_id
    // stays null. Caught by code review: the first draft of
    // student_matches_target's rewrite INNER JOINed through
    // student_enrollments/class_offerings, which silently excluded exactly
    // this Student for every scope including 'all', reverting a guarantee
    // 0188 explicitly preserved. Fixed to LEFT JOIN + check students.school_id
    // directly -- this test is what would have caught it.
    const { data: unplaced, error: unplacedErr } = await owner
      .from('students')
      .insert({ full_name: `${TAG} Unplaced Student`, student_no: `w603-unplaced-${Date.now()}` })
      .select('id')
      .single()
    if (unplacedErr) throw new Error(unplacedErr.message)
    const { data: email, error: loginErr } = await owner.rpc('create_student_login', {
      p_student_id: unplaced!.id,
      p_password: PASSWORD,
    })
    if (loginErr) throw new Error(loginErr.message)

    const { data: check } = await owner.from('students').select('current_enrollment_id').eq('id', unplaced!.id).single()
    expect(check!.current_enrollment_id).toBeNull()

    const { data: pub, error } = await owner
      .from('publications')
      .insert({ kind: 'notice', title: `${TAG} All Students Notice For Unplaced`, target_type: 'all' })
      .select('id')
      .single()
    if (error) throw new Error(error.message)

    expect(await canRead(email as string, pub!.id)).toBe(true)
  })

  it('an UNENROLLED Student cannot read an exact-Offering or broadcast target -- they have no Offering to match against', async () => {
    const { data: unplaced, error: unplacedErr } = await owner
      .from('students')
      .insert({ full_name: `${TAG} Unplaced Student Two`, student_no: `w603-unplaced2-${Date.now()}` })
      .select('id')
      .single()
    if (unplacedErr) throw new Error(unplacedErr.message)
    const { data: email, error: loginErr } = await owner.rpc('create_student_login', {
      p_student_id: unplaced!.id,
      p_password: PASSWORD,
    })
    if (loginErr) throw new Error(loginErr.message)

    const { data: pub, error } = await owner
      .from('publications')
      .insert({
        kind: 'notice',
        title: `${TAG} Exact Offering Notice For Unplaced`,
        target_type: 'specific',
        target_scope: 'offering',
        class_offering_id: offeringMorningId,
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)

    expect(await canRead(email as string, pub!.id)).toBe(false)
  })
})
