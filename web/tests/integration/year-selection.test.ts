import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'
import { applyGlobalYearFilterToStudents } from '@/lib/school/year-filter'
import { schoolRoster, studentRegister } from '@/lib/school/roster-source'
import { classCatalogueLabel } from '@/lib/class-catalogue'

// Global Academic Year Filtering for Students (issue #621's own follow-up,
// grilled explicitly against the initially-recommended "browse-only" split)
// proven against real data, not just a mocked query builder — mirrors
// tests/integration/shift-selection.test.ts's own "Students" describe block
// exactly (same TAG-and-cleanup shape, same admit_student_enrollment setup),
// swapping Shift for Academic Year and adding the one scenario Shift never
// had to consider: a Student's current Enrollment moving between years
// (Promotion / Transfer), and the temporary invisibility that follows when
// the year it lands in is deselected.

describe('applyGlobalYearFilterToStudents (issue #621)', () => {
  let owner: SupabaseClient
  const STAG = 'ZZ621yrsel'

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    await owner.from('students').delete().like('full_name', `${STAG}%`)
    await owner.from('class_offerings').delete().like('name', `${STAG}%`)

    const { data: offerings, error: offErr } = await owner
      .from('class_offerings')
      .insert([
        { name: `${STAG} Y2026`, academic_year: 2026 },
        { name: `${STAG} Y2027`, academic_year: 2027 },
      ])
      .select('id, name')
    if (offErr) throw new Error(offErr.message)
    const off2026 = offerings!.find((o) => o.name === `${STAG} Y2026`)!.id
    const off2027 = offerings!.find((o) => o.name === `${STAG} Y2027`)!.id

    const { data: students, error: stuErr } = await owner
      .from('students')
      .insert([
        { full_name: `${STAG} In2026` },
        { full_name: `${STAG} In2027` },
        { full_name: `${STAG} Unenrolled` },
      ])
      .select('id, full_name')
    if (stuErr) throw new Error(stuErr.message)
    const s2026 = students!.find((s) => s.full_name === `${STAG} In2026`)!.id
    const s2027 = students!.find((s) => s.full_name === `${STAG} In2027`)!.id

    for (const [studentId, classOfferingId] of [
      [s2026, off2026],
      [s2027, off2027],
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

  async function namesFiltered(selection: number[]): Promise<string[]> {
    const query = await applyGlobalYearFilterToStudents(
      owner,
      owner.from('students').select('full_name').like('full_name', `${STAG}%`),
      selection,
    )
    const { data, error } = await query
    if (error) throw new Error(error.message)
    return (data ?? []).map((r) => r.full_name).sort()
  }

  it('an empty selection is a true no-op', async () => {
    expect(await namesFiltered([])).toEqual([`${STAG} In2026`, `${STAG} In2027`, `${STAG} Unenrolled`])
  })

  it('includes the year-matching enrolled Student plus the unenrolled one, excludes the mismatched one', async () => {
    expect(await namesFiltered([2026])).toEqual([`${STAG} In2026`, `${STAG} Unenrolled`])
  })

  it('a Student with no current Enrollment at all always passes through, for any selection', async () => {
    expect(await namesFiltered([2027])).toEqual([`${STAG} In2027`, `${STAG} Unenrolled`])
    expect(await namesFiltered([2099])).toEqual([`${STAG} Unenrolled`])
  })

  it('selecting both years shows both enrolled Students plus the unenrolled one', async () => {
    expect(await namesFiltered([2026, 2027])).toEqual([`${STAG} In2026`, `${STAG} In2027`, `${STAG} Unenrolled`])
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

// schoolRoster / studentRegister (lib/school/roster-source.ts) are the ONE
// seam behind Students List, Mark Attendance, Attendance Book and the
// Student Log finder — proving the wiring at this seam proves it for all
// four screens at once, the same reasoning #621's own picker-label tests use.
describe('schoolRoster narrows "All Classes" to the Global Academic Year Selection (issue #621 follow-up)', () => {
  let owner: SupabaseClient
  const RTAG = 'ZZ621roster'
  let off2026: string
  let off2027: string
  let student2026: string

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    await owner.from('students').delete().like('full_name', `${RTAG}%`)
    await owner.from('class_offerings').delete().like('name', `${RTAG}%`)

    const { data: offerings, error: offErr } = await owner
      .from('class_offerings')
      .insert([
        { name: `${RTAG} Y2026`, academic_year: 2026 },
        { name: `${RTAG} Y2027`, academic_year: 2027 },
      ])
      .select('id, name')
    if (offErr) throw new Error(offErr.message)
    off2026 = offerings!.find((o) => o.name === `${RTAG} Y2026`)!.id
    off2027 = offerings!.find((o) => o.name === `${RTAG} Y2027`)!.id

    const { data: students, error: stuErr } = await owner
      .from('students')
      .insert([{ full_name: `${RTAG} Student` }])
      .select('id, full_name')
    if (stuErr) throw new Error(stuErr.message)
    student2026 = students![0].id

    const { error: admitErr } = await owner.rpc('admit_student_enrollment', {
      p_student_id: student2026,
      p_class_offering_id: off2026,
      p_roll_number: null,
      p_note: null,
    })
    if (admitErr) throw new Error(admitErr.message)
  })

  afterAll(async () => {
    await owner.from('students').delete().like('full_name', `${RTAG}%`)
    await owner.from('class_offerings').delete().like('name', `${RTAG}%`)
  })

  async function rosterNames(academicYearSelection: number[]): Promise<string[]> {
    const view = await schoolRoster(owner, { academicYearSelection })
    return view.students.filter((s) => s.full_name.startsWith(RTAG)).map((s) => s.full_name)
  }

  it('"All Classes" with the enrolled year selected shows the Student', async () => {
    expect(await rosterNames([2026])).toEqual([`${RTAG} Student`])
  })

  it('"All Classes" with the enrolled year deselected hides the Student entirely', async () => {
    expect(await rosterNames([2027])).toEqual([])
  })

  it('search cannot find the Student either once their year is deselected — no bypass', async () => {
    const view = await schoolRoster(owner, { academicYearSelection: [2027], q: 'Student' })
    expect(view.students.some((s) => s.full_name === `${RTAG} Student`)).toBe(false)
  })

  it('studentRegister (Mark Attendance\'s own seam) excludes the Student from the register the same way', async () => {
    const register = await studentRegister(owner, {
      date: '2026-01-01',
      viewerId: (await owner.auth.getUser()).data.user!.id,
      academicYearSelection: [2027],
    })
    expect(register.rows.some((r) => r.full_name === `${RTAG} Student`)).toBe(false)
  })

  it('promotion-lag: moving the Student to the 2027 Offering flips which selection reveals them', async () => {
    const { error } = await owner.rpc('set_student_enrollment', {
      p_student_id: student2026,
      p_class_offering_id: off2027,
      p_roll_number: null,
      p_outcome_for_previous: 'transferred',
      p_note: null,
    })
    if (error) throw new Error(error.message)

    // Now enrolled in 2027 — the year that was previously hiding them now shows them...
    expect(await rosterNames([2027])).toEqual([`${RTAG} Student`])
    // ...and 2026, their old year, no longer does: their CURRENT Enrollment is
    // what this filter tests, not their Enrollment history.
    expect(await rosterNames([2026])).toEqual([])
  })
})

// The Students List "Class" column (follow-up to #621 and the roster-year
// filter above): schoolRoster's returned RosterStudent now carries the rest
// of the current Enrollment's Offering (group_department/shift/academic_year),
// added so the page can render the shared classCatalogueLabel format instead
// of a bare class_name/section join. Proven end-to-end against real data
// because a typo'd column or a wrong join alias would silently show a
// truncated label in production, not fail a mock.
describe('schoolRoster carries enough Offering data for the shared Class Catalogue label', () => {
  let owner: SupabaseClient
  const CTAG = 'ZZ621classlabel'
  let studentId: string

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    await owner.from('students').delete().like('full_name', `${CTAG}%`)
    await owner.from('class_offerings').delete().like('name', `${CTAG}%`)

    const { data: offering, error: offErr } = await owner
      .from('class_offerings')
      .insert({
        name: `${CTAG} Nine`,
        section: 'A',
        group_department: 'Science',
        shift: 'Morning',
        academic_year: 2027,
      })
      .select('id')
      .single()
    if (offErr) throw new Error(offErr.message)

    const { data: student, error: stuErr } = await owner
      .from('students')
      .insert({ full_name: `${CTAG} Student` })
      .select('id')
      .single()
    if (stuErr) throw new Error(stuErr.message)
    studentId = student!.id

    const { error: admitErr } = await owner.rpc('admit_student_enrollment', {
      p_student_id: studentId,
      p_class_offering_id: offering!.id,
      p_roll_number: null,
      p_note: null,
    })
    if (admitErr) throw new Error(admitErr.message)
  })

  afterAll(async () => {
    await owner.from('students').delete().like('full_name', `${CTAG}%`)
    await owner.from('class_offerings').delete().like('name', `${CTAG}%`)
  })

  it("returns the row's group_department/shift/academic_year alongside class_name/section", async () => {
    const view = await schoolRoster(owner, { academicYearSelection: [2027] })
    const row = view.students.find((s) => s.id === studentId)!
    expect(row).toMatchObject({
      class_name: `${CTAG} Nine`,
      section: 'A',
      group_department: 'Science',
      shift: 'Morning',
      academic_year: 2027,
    })
  })

  it('feeds classCatalogueLabel to produce the exact format the Students List Class column shows', async () => {
    const view = await schoolRoster(owner, { academicYearSelection: [2027] })
    const row = view.students.find((s) => s.id === studentId)!
    expect(
      classCatalogueLabel(
        { name: row.class_name!, section: row.section, group_department: row.group_department, shift: row.shift, academic_year: row.academic_year },
        true,
      ),
    ).toBe(`${CTAG} Nine (Science) - Morning - A — 2027`)
  })

  it('omits the year segment for a single-started-year School (showYear false) — byte-identical to before this column existed', async () => {
    const view = await schoolRoster(owner, { academicYearSelection: [2027] })
    const row = view.students.find((s) => s.id === studentId)!
    expect(
      classCatalogueLabel(
        { name: row.class_name!, section: row.section, group_department: row.group_department, shift: row.shift, academic_year: row.academic_year },
        false,
      ),
    ).toBe(`${CTAG} Nine (Science) - Morning - A`)
  })
})
