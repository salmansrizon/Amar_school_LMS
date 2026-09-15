import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// Seam: issue #631 / ADR 0024 — a Class Offering that has ever been used
// (student_enrollments, subjects, fee_structures, routine_slots,
// class_routines, class_syllabi, exams, exam_combinations or publications
// reference it) can only be Archived, never permanently deleted from the UI;
// a genuinely fresh one stays deletable. class_offering_is_used and
// class_offerings_used_ids (migration 0202) are the single source of truth
// both the UI and the delete action's own defense-in-depth check rely on.
const TAG = 'ZZ631'

describe('Class Offering archive vs delete lifecycle (issue #631, ADR 0024)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let freshOffering: string // no dependents anywhere — stays deletable
  let subjectOffering: string // has a subject — used via config, not enrollment
  let enrollmentOffering: string // has an open student enrollment — used via history
  let broadcastOffering: string // named by a 'broadcast'-scope publication, no id link
  let allScopeOffering: string // reached only by an 'all'-scope publication — must NOT count
  let studentId: string
  const YEAR = 2031 // fixed, never a real active_academic_year, avoids colliding with seeded data

  async function cleanup() {
    await ownerA.from('students').delete().like('full_name', `${TAG} %`)
    await ownerA.from('subjects').delete().like('name', `${TAG} %`)
    await ownerA.from('publications').delete().eq('title', TAG)
    await ownerA.from('class_offerings').delete().like('name', `${TAG}-%`)
  }

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    await cleanup()

    const { data: offerings, error } = await ownerA
      .from('class_offerings')
      .insert([
        { name: `${TAG}-Fresh`, section: 'A', academic_year: YEAR },
        { name: `${TAG}-Subject`, section: 'A', academic_year: YEAR },
        { name: `${TAG}-Enrollment`, section: 'A', academic_year: YEAR },
        { name: `${TAG}-Broadcast`, section: 'A', academic_year: YEAR },
        { name: `${TAG}-AllScope`, section: 'A', academic_year: YEAR },
      ])
      .select('id, name')
    if (error) throw new Error(error.message)
    const byName = (n: string) => offerings!.find((o) => o.name === n)!.id
    freshOffering = byName(`${TAG}-Fresh`)
    subjectOffering = byName(`${TAG}-Subject`)
    enrollmentOffering = byName(`${TAG}-Enrollment`)
    broadcastOffering = byName(`${TAG}-Broadcast`)
    allScopeOffering = byName(`${TAG}-AllScope`)

    const { error: subjectError } = await ownerA
      .from('subjects')
      .insert({ class_id: subjectOffering, name: `${TAG} Science`, theory_marks: 100 })
    if (subjectError) throw new Error(subjectError.message)

    const { data: student, error: studentError } = await ownerA
      .from('students')
      .insert({ full_name: `${TAG} Student`, class_name: `${TAG}-Enrollment`, section: 'A' })
      .select('id')
      .single()
    if (studentError) throw new Error(studentError.message)
    studentId = student!.id

    const { error: enrollError } = await ownerA.rpc('admit_student_enrollment', {
      p_student_id: studentId,
      p_class_offering_id: enrollmentOffering,
      p_roll_number: null,
      p_note: null,
    })
    if (enrollError) throw new Error(enrollError.message)

    // A 'broadcast'-scope target names no id at all (map #598) — matched by
    // class name + year instead, so class_offering_is_used must match it the
    // same way, not by class_offering_id equality.
    const { error: broadcastError } = await ownerA.from('publications').insert({
      kind: 'notice',
      title: TAG,
      importance: 'normal',
      target_scope: 'broadcast',
      target_class_name: `${TAG}-Broadcast`,
      target_academic_year: YEAR,
    })
    if (broadcastError) throw new Error(broadcastError.message)

    // An 'all'-scope publication reaches every Offering in the School — it
    // must NOT make every Offering "used" (see migration 0202's own comment
    // on this exact exclusion).
    const { error: allScopeError } = await ownerA.from('publications').insert({
      kind: 'notice',
      title: TAG,
      importance: 'normal',
      target_scope: 'all',
    })
    if (allScopeError) throw new Error(allScopeError.message)
  })

  afterAll(cleanup)

  it('a fresh Class Offering (no dependents anywhere) is reported unused', async () => {
    const { data, error } = await ownerA.rpc('class_offering_is_used', { p_class_offering_id: freshOffering })
    expect(error).toBeNull()
    expect(data).toBe(false)
  })

  it('a Class Offering with a subject (config, no enrollment) is reported used', async () => {
    const { data, error } = await ownerA.rpc('class_offering_is_used', { p_class_offering_id: subjectOffering })
    expect(error).toBeNull()
    expect(data).toBe(true)
  })

  it('a Class Offering with an open student enrollment is reported used', async () => {
    const { data, error } = await ownerA.rpc('class_offering_is_used', { p_class_offering_id: enrollmentOffering })
    expect(error).toBeNull()
    expect(data).toBe(true)
  })

  it('a Class Offering named by a broadcast-scope publication (no id link) is reported used', async () => {
    const { data, error } = await ownerA.rpc('class_offering_is_used', { p_class_offering_id: broadcastOffering })
    expect(error).toBeNull()
    expect(data).toBe(true)
  })

  it('an all-scope publication does NOT make an unrelated Class Offering "used"', async () => {
    const { data, error } = await ownerA.rpc('class_offering_is_used', { p_class_offering_id: allScopeOffering })
    expect(error).toBeNull()
    expect(data).toBe(false)
  })

  it('class_offerings_used_ids lists every used id and excludes the fresh one', async () => {
    const { data, error } = await ownerA.rpc('class_offerings_used_ids')
    expect(error).toBeNull()
    const ids = (data ?? []).map((r: { class_offering_id: string }) => r.class_offering_id)
    expect(ids).toContain(subjectOffering)
    expect(ids).toContain(enrollmentOffering)
    expect(ids).toContain(broadcastOffering)
    expect(ids).not.toContain(freshOffering)
    expect(ids).not.toContain(allScopeOffering)
  })

  it("RLS: another school's owner never sees this school's used ids", async () => {
    const { data, error } = await ownerB.rpc('class_offerings_used_ids')
    expect(error).toBeNull()
    const ids = (data ?? []).map((r: { class_offering_id: string }) => r.class_offering_id)
    expect(ids).not.toContain(subjectOffering)
    expect(ids).not.toContain(enrollmentOffering)
  })

  it("RLS: another school's owner querying class_offering_is_used by id gets false, not this school's real answer", async () => {
    const { data, error } = await ownerB.rpc('class_offering_is_used', { p_class_offering_id: subjectOffering })
    expect(error).toBeNull()
    expect(data).toBe(false)
  })

  it('archiving a used Class Offering preserves its subjects and enrollment untouched', async () => {
    const { error: archiveSubjectErr } = await ownerA
      .from('class_offerings')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', subjectOffering)
    expect(archiveSubjectErr).toBeNull()

    const { data: subjectStillThere } = await ownerA
      .from('subjects')
      .select('id')
      .eq('class_id', subjectOffering)
    expect(subjectStillThere).toHaveLength(1)

    const { error: archiveEnrollErr } = await ownerA
      .from('class_offerings')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', enrollmentOffering)
    expect(archiveEnrollErr).toBeNull()

    // Archiving the Offering never closes the Student's open Enrollment —
    // attendance/fees/marks for this Student keep working exactly as before.
    const { data: student } = await ownerA
      .from('students')
      .select('current_enrollment_id')
      .eq('id', studentId)
      .single()
    const { data: enrollment } = await ownerA
      .from('student_enrollments')
      .select('id, class_offering_id, closed_at')
      .eq('id', student!.current_enrollment_id)
      .single()
    expect(enrollment?.class_offering_id).toBe(enrollmentOffering)
    expect(enrollment?.closed_at).toBeNull()
  })

  it('restoring a Class Offering clears archived_at', async () => {
    const { error } = await ownerA
      .from('class_offerings')
      .update({ archived_at: null })
      .eq('id', subjectOffering)
    expect(error).toBeNull()
    const { data } = await ownerA
      .from('class_offerings')
      .select('archived_at')
      .eq('id', subjectOffering)
      .single()
    expect(data?.archived_at).toBeNull()
  })

  it('a fresh Class Offering can still be permanently deleted (unchanged behavior)', async () => {
    const { error } = await ownerA.from('class_offerings').delete().eq('id', freshOffering)
    expect(error).toBeNull()
    const { data } = await ownerA.from('class_offerings').select('id').eq('id', freshOffering)
    expect(data).toHaveLength(0)
  })
})
