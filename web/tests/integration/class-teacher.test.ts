import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn, PASSWORD } from '../helpers/auth'

// Seam: the Class Teacher link (#443, decision on #435) — classes.class_teacher_id
// → employees.id with a same-school composite FK, and employees.profile_id as
// the bridge from the HR record to an actual login.

describe('Class Teacher (#443)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let staff: SupabaseClient
  let employeeId: string
  let classId: string
  let staffProfileId: string

  async function cleanup() {
    await ownerA.from('classes').delete().like('name', 'CT1 %')
    await ownerA.from('employees').delete().like('full_name', 'CT1 %')
    await ownerB.from('classes').delete().like('name', 'CT1 %')
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
      .from('classes')
      .insert({ name: 'CT1 Class', section: 'A', class_teacher_id: employeeId })
      .select('id')
      .single()
    if (classError) throw new Error(classError.message)
    classId = klass.id
  })

  afterAll(cleanup)

  it('a class carries its class teacher', async () => {
    const { data } = await ownerA
      .from('classes')
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
      .from('classes')
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
    const { data: me } = await staff
      .from('employees')
      .select('id')
      .eq('profile_id', staffProfileId)
      .maybeSingle()
    expect(me?.id).toBe(employeeId)

    const { data: mine } = await staff
      .from('classes')
      .select('name, section')
      .eq('class_teacher_id', me!.id)
    expect(mine).toEqual([{ name: 'CT1 Class', section: 'A' }])
  })

  it('clears the class teacher rather than deleting the class when the Employee goes', async () => {
    // ON DELETE SET NULL names class_teacher_id explicitly (PG15+); the default
    // would try to null school_id too, which is NOT NULL — and a cascade would
    // have deleted the Class along with its teacher.
    await ownerA.from('employees').delete().eq('id', employeeId)

    const { data } = await ownerA
      .from('classes')
      .select('id, class_teacher_id')
      .eq('id', classId)
      .maybeSingle()
    expect(data?.id).toBe(classId)
    expect(data?.class_teacher_id).toBeNull()
  })
})
