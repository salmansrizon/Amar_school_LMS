import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn, PASSWORD } from '../helpers/auth'
import { applyGlobalShiftFilterToStudents } from '@/lib/school/shift-filter'

// Seam: migration 0160 / ADR 0021 — a class attachment narrows a Grant.
//
// Every actor below holds the `students` grant where it matters, so a passing
// row here is the attachment doing the work and not the Grant. The point of the
// ticket (#525) is that the Grant alone used to be enough.
//
//   Owner                     | whole school
//   office-staff (no employee)| whole school
//   teacher-e2e (class teacher of ZZ525-A) | only ZZ525-A
//   subject-teacher (employee, unattached to these) | neither
const TAG = 'ZZ525'

describe('Class attachment narrows a Grant (#525, migration 0160)', () => {
  let owner: SupabaseClient
  let officeStaff: SupabaseClient
  let classTeacher: SupabaseClient
  let unattached: SupabaseClient
  let studentInA: string
  let studentInB: string

  async function cleanup() {
    await owner.from('students').delete().like('full_name', `${TAG} %`)
    await owner.from('class_offerings').delete().like('name', `${TAG}%`)
    await owner.from('employees').delete().like('full_name', `${TAG} %`)
  }

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    officeStaff = await signedIn('office-staff@test.local', PASSWORD)
    classTeacher = await signedIn('teacher-e2e@test.local', PASSWORD)
    unattached = await signedIn('subject-teacher@test.local', PASSWORD)
    await cleanup()

    const teacherProfile = (await classTeacher.auth.getUser()).data.user!.id
    const { data: employee } = await owner
      .from('employees')
      .select('id')
      .eq('profile_id', teacherProfile)
      .is('archived_at', null)
      .single()

    // A dedicated, genuinely zero-attachment Employee for `unattached`, not
    // whatever happens to already hold subject-teacher@test.local's profile:
    // that login is shared with other suites (student-message-scope.test.ts
    // links it to the seed's own Subject Teacher, who legitimately IS attached
    // to Seed Class A's routine — real, permanent seed data, not a fixture
    // leak). This test needs an employee attached to NEITHER of its own
    // classes NOR anywhere else, so it creates and owns one, rather than
    // depending on which OTHER suite last touched this shared login (a real
    // cross-file fragility this exact assertion was silently depending on).
    // Defensive, not redundant with `cleanup()` above (which only deletes BY
    // NAME): app_current_employee_id() has no LIMIT 1/ORDER BY, so if ANY
    // other employees row were left holding this same shared login's profile
    // — a crashed prior run of this file, or another suite's own link — it
    // would silently coexist with the one below instead of erring loudly.
    // Clearing every holder of this profile first makes the insert
    // idempotent regardless of what an earlier interrupted run left behind.
    const unattachedProfile = (await unattached.auth.getUser()).data.user!.id
    await owner.from('employees').update({ profile_id: null }).eq('profile_id', unattachedProfile)
    const { error: unattachedEmpErr } = await owner
      .from('employees')
      .insert({ full_name: `${TAG} Unattached`, profile_id: unattachedProfile })
    if (unattachedEmpErr) throw new Error(unattachedEmpErr.message)

    // A is hers; B is not. Same school, so only the attachment separates them.
    const { data: offerings, error: classErr } = await owner
      .from('class_offerings')
      .insert([
        { name: `${TAG}-A`, section: 'A', class_teacher_id: employee!.id, shift: 'Morning' },
        { name: `${TAG}-B`, section: 'A', shift: 'Evening' },
      ])
      .select('id, name')
    if (classErr) throw new Error(classErr.message)
    const offeringA = offerings!.find((o) => o.name === `${TAG}-A`)!.id
    const offeringB = offerings!.find((o) => o.name === `${TAG}-B`)!.id

    // class_name/section still ride along on the students row itself (they
    // back student_in_class(), unrelated to capacity) — but which class a
    // Class/Subject Teacher may act on is now decided by current_enrollment_id,
    // not this text, so each student is also admitted into its Offering below.
    const { data: students, error: studentErr } = await owner
      .from('students')
      .insert([
        { full_name: `${TAG} Child A`, class_name: `${TAG}-A`, section: 'A' },
        { full_name: `${TAG} Child B`, class_name: `${TAG}-B`, section: 'A' },
      ])
      .select('id, class_name')
    if (studentErr) throw new Error(studentErr.message)
    studentInA = students!.find((s) => s.class_name === `${TAG}-A`)!.id
    studentInB = students!.find((s) => s.class_name === `${TAG}-B`)!.id

    const { error: admitAErr } = await owner.rpc('admit_student_enrollment', {
      p_student_id: studentInA,
      p_class_offering_id: offeringA,
      p_roll_number: null,
      p_note: null,
    })
    if (admitAErr) throw new Error(admitAErr.message)
    const { error: admitBErr } = await owner.rpc('admit_student_enrollment', {
      p_student_id: studentInB,
      p_class_offering_id: offeringB,
      p_roll_number: null,
      p_note: null,
    })
    if (admitBErr) throw new Error(admitBErr.message)
  })

  afterAll(cleanup)

  const namesFor = async (client: SupabaseClient) => {
    const { data } = await client.from('students').select('full_name').like('full_name', `${TAG} %`)
    return (data ?? []).map((s) => s.full_name).sort()
  }

  it('the Owner keeps the whole school', async () => {
    expect(await namesFor(owner)).toEqual([`${TAG} Child A`, `${TAG} Child B`])
  })

  it('office staff — no employees row — keep the whole school', async () => {
    expect(await namesFor(officeStaff)).toEqual([`${TAG} Child A`, `${TAG} Child B`])
  })

  it('a Class Teacher sees her own class and not the other one', async () => {
    expect(await namesFor(classTeacher)).toEqual([`${TAG} Child A`])
  })

  // The case that decided the design: keying on the attachment rather than the
  // employees row would have handed this actor the whole school.
  it('an Employee with no attachment to these classes sees neither', async () => {
    expect(await namesFor(unattached)).toEqual([])
  })

  it('a Class Teacher cannot reach another class by guessed id', async () => {
    const { data } = await classTeacher.from('students').select('id').eq('id', studentInB).maybeSingle()
    expect(data).toBeNull()
  })

  it('a Class Teacher cannot archive another class child', async () => {
    await classTeacher.from('students').update({ archived_at: new Date().toISOString() }).eq('id', studentInB)
    const { data } = await owner.from('students').select('archived_at').eq('id', studentInB).single()
    expect(data!.archived_at).toBeNull()
  })

  it('a Class Teacher can still act on her own child', async () => {
    const { error } = await classTeacher
      .from('students')
      .update({ guardian_name: `${TAG} Guardian` })
      .eq('id', studentInA)
    expect(error).toBeNull()
    const { data } = await owner.from('students').select('guardian_name').eq('id', studentInA).single()
    expect(data!.guardian_name).toBe(`${TAG} Guardian`)
  })

  // The UAT pass reached /school/classes as a Class Teacher and found
  // destructive catalogue controls live. Reading the catalogue is still fine —
  // every class picker needs it — but a teaching assignment is not authority to
  // delete the school's classes.
  it('a Class Teacher reads the class catalogue but cannot write it', async () => {
    const { data: readable } = await classTeacher.from('class_offerings').select('name').like('name', `${TAG}%`)
    expect((readable ?? []).length).toBe(2)

    await classTeacher.from('class_offerings').delete().eq('name', `${TAG}-B`)
    const { data: still } = await owner.from('class_offerings').select('name').eq('name', `${TAG}-B`)
    expect((still ?? []).length).toBe(1)
  })

  it('office staff holding the classes grant can still write the catalogue', async () => {
    const { error } = await officeStaff
      .from('class_offerings')
      .update({ group_department: 'Science' })
      .eq('name', `${TAG}-B`)
    expect(error).toBeNull()
  })

  // Found in review of 0160, fixed by 0163. The WITH CHECK term called
  // staff_class_capacity_for_student(id), which re-reads the COMMITTED row — so on
  // UPDATE it re-asked the question USING had already answered and always agreed.
  // A Class Teacher could move a child into a class she does not hold and strand
  // them somewhere she can then neither see nor undo.
  it('a Class Teacher cannot move her own child into a class she does not hold', async () => {
    await classTeacher.from('students').update({ class_name: `${TAG}-B` }).eq('id', studentInA)
    const { data } = await owner.from('students').select('class_name').eq('id', studentInA).single()
    expect(data!.class_name).toBe(`${TAG}-A`)
  })

  // ADR 0021: a Subject Teacher gets the students of classes he teaches so he can
  // teach them, and decides nothing about them. 0160 wrote both halves as
  // `capacity is not null`, which is true for subject_teacher.
  it('reports the caller class scope from one definer function', async () => {
    const scopes = await Promise.all(
      [owner, officeStaff, classTeacher, unattached].map((c) => c.rpc('app_class_scope').then((r) => r.data)),
    )
    expect(scopes).toEqual(['school-wide', 'school-wide', 'attached', 'none'])
  })

  // The reason app_class_scope has to be a definer function: employees and
  // routine_slots are grant-gated, so a teacher cannot read her own attachment.
  // An earlier TypeScript version read them directly, got nothing back, and
  // concluded she was office staff.
  it('a Class Teacher cannot read the tables her own attachment lives in', async () => {
    const { data: employees } = await classTeacher.from('employees').select('id').limit(1)
    expect(employees ?? []).toEqual([])
  })

  // Global Shift Filtering (issue #579, Wave 5/#590) authorization-
  // independence (#581 item 5): confirmed structurally in #578 that RLS
  // cannot read the asm-shift-selection cookie at all (it lives entirely
  // outside the database), so this proves it holds in practice rather than
  // re-deriving why. The invariant under test is narrower than "always
  // returns Child A": a shift filter can legitimately narrow her down to
  // zero (if her own class's shift isn't in the selection, same as any
  // other shift-filtered screen) — what it must NEVER do is let Child B
  // through, for any selection, including one built specifically from
  // Offering B's own shift ('Evening'). That would be shift filtering
  // acting as an authorization bypass, which #578 ruled out structurally;
  // this is the empirical check that it actually holds.
  async function namesForFiltered(selection: string[]): Promise<string[]> {
    const query = await applyGlobalShiftFilterToStudents(
      classTeacher,
      classTeacher.from('students').select('full_name').like('full_name', `${TAG} %`),
      selection,
    )
    const { data, error } = await query
    if (error) throw new Error(error.message)
    return (data ?? []).map((r: { full_name: string }) => r.full_name)
  }

  it('...with an empty selection (no-op), still only her own class', async () => {
    expect(await namesForFiltered([])).toEqual([`${TAG} Child A`])
  })
  it('...with a selection matching her own class, still only her own class', async () => {
    expect(await namesForFiltered(['Morning'])).toEqual([`${TAG} Child A`])
  })
  it("...with a selection matching the OTHER class's own shift, Child B still never appears", async () => {
    // Correctly narrows her OWN class out too (Morning isn't selected) —
    // the point isn't that she still sees Child A, it's that Evening being
    // selected never admits Child B.
    expect(await namesForFiltered(['Evening'])).toEqual([])
  })
  it('...with a selection matching neither class, still empty, never Child B', async () => {
    expect(await namesForFiltered(['Day'])).toEqual([])
  })
})
