import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'
import { applyGlobalShiftFilterToOfferings, applyGlobalShiftFilterToStudents } from '@/lib/school/shift-filter'

// Global Shift Filtering (issue #579) proven against real data, not just a
// mocked query builder (tests/unit/shift-filter.test.ts covers the string
// composition in isolation) — this is the live-Postgres proof that the
// composed `.or()` filter actually behaves as specified: a NULL-shift row
// always passes through, an empty selection is a true no-op, and narrowing
// the selection only ever changes what a *list* query returns — the row
// itself, and its reachability by id, is untouched (#581 item 3).

const TAG = 'ZZ590sel'

describe('Global Shift Filtering (issue #579)', () => {
  let owner: SupabaseClient
  let morningId: string
  let eveningId: string
  let nullShiftId: string

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    await owner.from('class_offerings').delete().like('name', `${TAG}%`)

    const rows = [
      { name: `${TAG} Morning`, shift: 'Morning' },
      { name: `${TAG} Evening`, shift: 'Evening' },
      { name: `${TAG} NoShift`, shift: null },
    ]
    const { data, error } = await owner.from('class_offerings').insert(rows).select('id, name, shift')
    if (error) throw new Error(error.message)
    morningId = data!.find((r) => r.name === `${TAG} Morning`)!.id
    eveningId = data!.find((r) => r.name === `${TAG} Evening`)!.id
    nullShiftId = data!.find((r) => r.name === `${TAG} NoShift`)!.id
  })

  afterAll(async () => {
    await owner.from('class_offerings').delete().like('name', `${TAG}%`)
  })

  async function namesFiltered(selection: string[]): Promise<string[]> {
    const { data, error } = await applyGlobalShiftFilterToOfferings(
      owner.from('class_offerings').select('name').like('name', `${TAG}%`),
      selection,
    )
    if (error) throw new Error(error.message)
    return (data ?? []).map((r) => r.name).sort()
  }

  it('an empty selection is a true no-op — every row returned regardless of shift', async () => {
    expect(await namesFiltered([])).toEqual([`${TAG} Evening`, `${TAG} Morning`, `${TAG} NoShift`])
  })

  it('a narrowed selection includes the matching Shift plus the NULL-shift row, excludes the rest', async () => {
    expect(await namesFiltered(['Morning'])).toEqual([`${TAG} Morning`, `${TAG} NoShift`])
  })

  it('the NULL-shift row passes through no matter which Shift is selected', async () => {
    expect(await namesFiltered(['Evening'])).toEqual([`${TAG} Evening`, `${TAG} NoShift`])
  })

  it('a selection matching nothing configured still returns only the NULL-shift row, not zero rows', async () => {
    expect(await namesFiltered(['Night'])).toEqual([`${TAG} NoShift`])
  })

  it('historical data survives narrowing: a filtered-out Offering is still reachable by id, unmodified', async () => {
    // Evening is excluded from a Morning-only filtered list (proven above),
    // but the row itself is never touched by that filtering — direct id
    // lookup, bypassing the filter entirely, still resolves it intact.
    const { data } = await owner.from('class_offerings').select('id, name, shift').eq('id', eveningId).single()
    expect(data).toEqual({ id: eveningId, name: `${TAG} Evening`, shift: 'Evening' })
  })

  it('filtering never mutates business data — a full re-read after every filtered query above still shows all 3 rows unchanged', async () => {
    const { data } = await owner
      .from('class_offerings')
      .select('id, shift')
      .in('id', [morningId, eveningId, nullShiftId])
    const byId = new Map((data ?? []).map((r) => [r.id, r.shift]))
    expect(byId.get(morningId)).toBe('Morning')
    expect(byId.get(eveningId)).toBe('Evening')
    expect(byId.get(nullShiftId)).toBeNull()
  })
})

// applyGlobalShiftFilterToStudents (issue #579) — a genuinely different
// mechanism from the Offerings helper above (see shift-filter.ts's own
// comment on why a single embedded-resource `.or()` doesn't work here),
// so it earns its own live-Postgres proof: a student enrolled in a
// shift-matching Offering is included, one enrolled in a non-matching
// Offering is excluded, and — the one a naive implementation gets wrong —
// a student with NO current Enrollment at all is always included,
// regardless of selection, the same as a NULL-shift Offering.
describe('Global Shift Filtering for Students (issue #579)', () => {
  let owner: SupabaseClient
  const STAG = 'ZZ590stusel'

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    await owner.from('students').delete().like('full_name', `${STAG}%`)
    await owner.from('class_offerings').delete().like('name', `${STAG}%`)

    const { data: offerings, error: offErr } = await owner
      .from('class_offerings')
      .insert([
        { name: `${STAG} Morning`, shift: 'Morning' },
        { name: `${STAG} Evening`, shift: 'Evening' },
      ])
      .select('id, name')
    if (offErr) throw new Error(offErr.message)
    const morningOffering = offerings!.find((o) => o.name === `${STAG} Morning`)!.id
    const eveningOffering = offerings!.find((o) => o.name === `${STAG} Evening`)!.id

    const { data: students, error: stuErr } = await owner
      .from('students')
      .insert([
        { full_name: `${STAG} InMorning` },
        { full_name: `${STAG} InEvening` },
        { full_name: `${STAG} Unenrolled` },
      ])
      .select('id, full_name')
    if (stuErr) throw new Error(stuErr.message)
    const sMorning = students!.find((s) => s.full_name === `${STAG} InMorning`)!.id
    const sEvening = students!.find((s) => s.full_name === `${STAG} InEvening`)!.id

    for (const [studentId, classOfferingId] of [
      [sMorning, morningOffering],
      [sEvening, eveningOffering],
    ]) {
      const { error } = await owner.rpc('admit_student_enrollment', {
        p_student_id: studentId,
        p_class_offering_id: classOfferingId,
        p_roll_number: null,
        p_note: null,
      })
      if (error) throw new Error(error.message)
    }
    // `${STAG} Unenrolled` is left with no admission at all — current_enrollment_id stays NULL.
  })

  afterAll(async () => {
    await owner.from('students').delete().like('full_name', `${STAG}%`)
    await owner.from('class_offerings').delete().like('name', `${STAG}%`)
  })

  async function namesFiltered(selection: string[]): Promise<string[]> {
    const query = await applyGlobalShiftFilterToStudents(
      owner,
      owner.from('students').select('full_name').like('full_name', `${STAG}%`),
      selection,
    )
    const { data, error } = await query
    if (error) throw new Error(error.message)
    return (data ?? []).map((r) => r.full_name).sort()
  }

  it('an empty selection is a true no-op', async () => {
    expect(await namesFiltered([])).toEqual([`${STAG} InEvening`, `${STAG} InMorning`, `${STAG} Unenrolled`])
  })

  it('includes the shift-matching enrolled Student plus the unenrolled one, excludes the mismatched one', async () => {
    expect(await namesFiltered(['Morning'])).toEqual([`${STAG} InMorning`, `${STAG} Unenrolled`])
  })

  it('a Student with no current Enrollment at all always passes through, for any selection', async () => {
    expect(await namesFiltered(['Evening'])).toEqual([`${STAG} InEvening`, `${STAG} Unenrolled`])
    expect(await namesFiltered(['Night'])).toEqual([`${STAG} Unenrolled`])
  })

  it("filtering never mutates the Student's Enrollment or the Offering it points at", async () => {
    const { data } = await owner
      .from('students')
      .select('full_name, current_enrollment_id')
      .like('full_name', `${STAG}%`)
    const withEnrollment = (data ?? []).filter((s) => s.full_name !== `${STAG} Unenrolled`)
    expect(withEnrollment.every((s) => s.current_enrollment_id !== null)).toBe(true)
    const unenrolled = (data ?? []).find((s) => s.full_name === `${STAG} Unenrolled`)
    expect(unenrolled!.current_enrollment_id).toBeNull()
  })
})
