import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn, PASSWORD } from '../helpers/auth'

// Seam: the Class Teacher link (#443, decision on #435) —
// class_offerings.class_teacher_id (renamed from classes, #571/#584) →
// employees.id with a same-school composite FK, and employees.profile_id as
// the bridge from the HR record to an actual login.

describe('Class Teacher (#443)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let staff: SupabaseClient
  let employeeId: string
  let classId: string
  let staffProfileId: string

  async function cleanup() {
    await ownerA.from('students').delete().like('full_name', 'CT1 %')
    await ownerA.from('class_offerings').delete().like('name', 'CT1 %')
    await ownerA.from('employees').delete().like('full_name', 'CT1 %')
    await ownerB.from('class_offerings').delete().like('name', 'CT1 %')
    await ownerB.from('employees').delete().like('full_name', 'CT1 %')
  }

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    staff = await signedIn('staff-e2e@test.local', PASSWORD)
    staffProfileId = (await staff.auth.getUser()).data.user!.id
    await cleanup()

    const { data: employee, error: employeeError } = await ownerA
      .from('employees')
      .insert({ full_name: 'CT1 Teacher' })
      .select('id')
      .single()
    if (employeeError) throw new Error(employeeError.message)
    employeeId = employee.id

    const { data: klass, error: classError } = await ownerA
      .from('class_offerings')
      .insert({ name: 'CT1 Class', section: 'A', class_teacher_id: employeeId })
      .select('id')
      .single()
    if (classError) throw new Error(classError.message)
    classId = klass.id
  })

  afterAll(cleanup)

  it('a class carries its class teacher', async () => {
    const { data } = await ownerA
      .from('class_offerings')
      .select('class_teacher_id')
      .eq('id', classId)
      .single()
    expect(data!.class_teacher_id).toBe(employeeId)
  })

  it('refuses a class teacher from another school', async () => {
    const { data: theirs, error: theirsError } = await ownerB
      .from('employees')
      .insert({ full_name: 'CT1 Outsider' })
      .select('id')
      .single()
    expect(theirsError).toBeNull()

    // The composite FK (school_id, class_teacher_id) → employees (school_id, id)
    // is what stops this — an app-level check alone could be bypassed by posting
    // the foreign UUID straight at PostgREST.
    const { error } = await ownerA
      .from('class_offerings')
      .update({ class_teacher_id: theirs!.id })
      .eq('id', classId)
    expect(error).not.toBeNull()
  })

  it('links an Employee to a Staff User login, and refuses a foreign one', async () => {
    const ok = await ownerA
      .from('employees')
      .update({ profile_id: staffProfileId })
      .eq('id', employeeId)
      .select('id')
    expect(ok.error).toBeNull()
    expect(ok.data).toHaveLength(1)

    const otherOwner = (await ownerB.auth.getUser()).data.user!.id
    const bad = await ownerA
      .from('employees')
      .update({ profile_id: otherOwner })
      .eq('id', employeeId)
    expect(bad.error?.message).toContain('does not belong to this school')
  })

  it('the linked teacher finds their own classes and no one else’s', async () => {
    // Via the definer scalar, not a read of `employees` — that table is gated
    // on the Employees grant (0136) and a Class Teacher rarely holds it.
    const { data: myEmployeeId } = await staff.rpc('app_current_employee_id')
    expect(myEmployeeId).toBe(employeeId)

    const { data: mine } = await staff
      .from('class_offerings')
      .select('name, section')
      .eq('class_teacher_id', myEmployeeId)
    expect(mine).toEqual([{ name: 'CT1 Class', section: 'A' }])
  })

  it('a Class Teacher with an enrolled Student sees exactly her own roster (map #582 §0 regression)', async () => {
    // The regression this test exists to catch (#587's own Wave 4a planning
    // pass, tracked on map #582 since Wave 2): staff_class_capacity_for_student
    // resolves via students -> student_enrollments on current_enrollment_id.
    // Before Wave 6 backfilled that column, EVERY Class/Subject Teacher saw
    // zero students, app-wide -- a capacity function pointed at the right
    // model, but with nothing in it yet. This proves the whole chain now
    // resolves end to end: admit a real Student into CT1 Class via the same
    // transition primitive the app uses, then read as the linked teacher.
    const { data: created, error: insertError } = await ownerA
      .from('students')
      .insert({ full_name: 'CT1 Roster Student' })
      .select('id')
      .single()
    if (insertError) throw new Error(insertError.message)
    const studentId = created!.id

    const { error: admitError } = await ownerA.rpc('admit_student_enrollment', {
      p_student_id: studentId,
      p_class_offering_id: classId,
      p_roll_number: null,
      p_note: null,
    })
    if (admitError) throw new Error(admitError.message)

    const { data: mine } = await staff.from('students').select('id, full_name').eq('id', studentId)
    expect(mine).toHaveLength(1)
    expect(mine![0].full_name).toBe('CT1 Roster Student')

    // And the roster model itself (lib/school/roster-source.ts) resolves the
    // same Student's class via her current Enrollment, not a legacy text
    // bridge she never had a students.class_name for in the first place
    // (admit_student_enrollment never sets it).
    const { data: enrolled } = await staff
      .from('students')
      .select('id, current_enrollment_id, student_enrollments!students_current_enrollment_id_fkey(class_offering_id)')
      .eq('id', studentId)
      .single()
    expect(enrolled?.current_enrollment_id).not.toBeNull()
    const embed = enrolled!.student_enrollments as unknown as { class_offering_id: string }[] | { class_offering_id: string }
    const offeringId = Array.isArray(embed) ? embed[0]?.class_offering_id : embed?.class_offering_id
    expect(offeringId).toBe(classId)
  })

  it('clears the class teacher rather than deleting the class when the Employee goes', async () => {
    // ON DELETE SET NULL names class_teacher_id explicitly (PG15+); the default
    // would try to null school_id too, which is NOT NULL — and a cascade would
    // have deleted the Class along with its teacher.
    await ownerA.from('employees').delete().eq('id', employeeId)

    const { data } = await ownerA
      .from('class_offerings')
      .select('id, class_teacher_id')
      .eq('id', classId)
      .maybeSingle()
    expect(data?.id).toBe(classId)
    expect(data?.class_teacher_id).toBeNull()
  })
})
