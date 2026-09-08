import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// issue #595, map #598 Wave 3 (#604) -- task_completion_roster independently
// re-implemented the same targeting rule student_matches_target() already
// carries, and had already drifted from it once (#601). Proves it now
// resolves via the shared predicate instead -- mirrors wave593-uniqueness-
// and-routing.test.ts's own two-Offerings-sharing-a-name-and-section shape,
// the exact scenario this whole map exists to keep correct, applied here to
// the roster a teacher actually sees on My Classes.

const TAG = 'W604'

describe('task_completion_roster resolves via the shared predicate (#595, #604)', () => {
  let owner: SupabaseClient
  let offeringMorningId: string
  let offeringDayId: string
  let studentMorningId: string
  let studentDayId: string

  async function cleanup() {
    await owner.from('students').delete().like('full_name', `${TAG} %`)
    await owner.from('publications').delete().like('title', `${TAG} %`)
    await owner.from('class_offerings').delete().like('name', `${TAG}%`)
  }

  async function admit(fullName: string, offeringId: string, rollNumber: number): Promise<string> {
    const { data: student, error: studentErr } = await owner
      .from('students')
      .insert({ full_name: fullName, student_no: `w604-${Date.now()}-${rollNumber}` })
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
    return student!.id
  }

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    await cleanup()

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

    studentMorningId = await admit(`${TAG} Morning Student`, offeringMorningId, 1)
    studentDayId = await admit(`${TAG} Day Student`, offeringDayId, 1)
  })

  afterAll(cleanup)

  it("exact-Offering homework target: only the targeted Offering's Student appears on the roster, not the same-name-section-different-Shift one (the #593-class scenario)", async () => {
    const { data: pub, error } = await owner
      .from('publications')
      .insert({
        kind: 'homework',
        title: `${TAG} Exact Offering Homework`,
        target_type: 'specific',
        target_scope: 'offering',
        class_offering_id: offeringMorningId,
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)

    const { data: roster, error: rosterErr } = await owner
      .from('task_completion_roster')
      .select('student_id')
      .eq('publication_id', pub!.id)
    if (rosterErr) throw new Error(rosterErr.message)

    const ids = (roster ?? []).map((r) => r.student_id)
    expect(ids).toContain(studentMorningId)
    expect(ids).not.toContain(studentDayId)
  })

  it('broadcast homework target, Any Shift: both same-name-section-different-Shift Students appear on the roster', async () => {
    const { data: year } = await owner.from('class_offerings').select('academic_year').eq('id', offeringMorningId).single()
    const { data: pub, error } = await owner
      .from('publications')
      .insert({
        kind: 'homework',
        title: `${TAG} Broadcast Any Shift Homework`,
        target_type: 'specific',
        target_scope: 'broadcast',
        target_class_name: `${TAG} Nine`,
        target_academic_year: year!.academic_year,
        target_section: 'A',
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)

    const { data: roster, error: rosterErr } = await owner
      .from('task_completion_roster')
      .select('student_id')
      .eq('publication_id', pub!.id)
    if (rosterErr) throw new Error(rosterErr.message)

    const ids = (roster ?? []).map((r) => r.student_id)
    expect(ids).toContain(studentMorningId)
    expect(ids).toContain(studentDayId)
  })

  it('broadcast homework target, a specific Shift: only the matching-Shift Student appears', async () => {
    const { data: year } = await owner.from('class_offerings').select('academic_year').eq('id', offeringMorningId).single()
    const { data: pub, error } = await owner
      .from('publications')
      .insert({
        kind: 'homework',
        title: `${TAG} Broadcast Morning-Only Homework`,
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

    const { data: roster, error: rosterErr } = await owner
      .from('task_completion_roster')
      .select('student_id')
      .eq('publication_id', pub!.id)
    if (rosterErr) throw new Error(rosterErr.message)

    const ids = (roster ?? []).map((r) => r.student_id)
    expect(ids).toContain(studentMorningId)
    expect(ids).not.toContain(studentDayId)
  })

  it("a school-wide (target_scope='all') homework target still reaches every Student, enrolled or not", async () => {
    const { data: pub, error } = await owner
      .from('publications')
      .insert({ kind: 'homework', title: `${TAG} All Students Homework`, target_type: 'all' })
      .select('id')
      .single()
    if (error) throw new Error(error.message)

    const { data: roster, error: rosterErr } = await owner
      .from('task_completion_roster')
      .select('student_id')
      .eq('publication_id', pub!.id)
    if (rosterErr) throw new Error(rosterErr.message)

    const ids = (roster ?? []).map((r) => r.student_id)
    expect(ids).toContain(studentMorningId)
    expect(ids).toContain(studentDayId)
  })
})
