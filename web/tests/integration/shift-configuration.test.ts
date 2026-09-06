import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// Institute Shift Configuration (issue #576) + the map's binding
// verification requirement (#581 items 1-2): No-Shift stays first-class, and
// narrowing schools.configured_shifts never rewrites or deletes anything
// that already referenced a now-unconfigured Shift value — it only changes
// which values are *offered* going forward. Mutates the shared test
// School's configured_shifts, same shared-row pattern as
// employees-grace.test.ts's set_school_default_grace — restored in
// afterAll so no other suite is affected by the transient change.

const TAG = 'ZZ590shift'

describe('Institute Shift Configuration (issue #576)', () => {
  let owner: SupabaseClient
  let schoolId: string
  let originalConfiguredShifts: string[]
  let classId: string
  let employeeId: string

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    const { data: schoolIdData } = await owner.rpc('app_current_school_id')
    schoolId = schoolIdData as string
    const { data: school } = await owner
      .from('schools')
      .select('configured_shifts')
      .eq('id', schoolId)
      .single()
    originalConfiguredShifts = school!.configured_shifts

    // Idempotent cleanup of prior runs.
    await owner.from('class_offerings').delete().eq('name', TAG)
    await owner.from('employees').delete().eq('full_name', TAG)

    const { data: cls, error: clsErr } = await owner
      .from('class_offerings')
      .insert({ name: TAG, shift: 'Evening' })
      .select('id')
      .single()
    if (clsErr) throw new Error(clsErr.message)
    classId = cls!.id

    const { data: emp, error: empErr } = await owner
      .from('employees')
      .insert({ full_name: TAG })
      .select('id')
      .single()
    if (empErr) throw new Error(empErr.message)
    employeeId = emp!.id
    const { error: shiftErr } = await owner
      .from('employee_academic_shifts')
      .insert({ employee_id: employeeId, shift: 'Evening' })
    if (shiftErr) throw new Error(shiftErr.message)
  })

  afterAll(async () => {
    await owner.from('schools').update({ configured_shifts: originalConfiguredShifts }).eq('id', schoolId)
    await owner.from('class_offerings').delete().eq('id', classId)
    await owner.from('employees').delete().eq('id', employeeId)
  })

  it('No-Shift (empty configured_shifts) is a fully valid, first-class state', async () => {
    const { error } = await owner.from('schools').update({ configured_shifts: [] }).eq('id', schoolId)
    expect(error).toBeNull()
    const { data: school } = await owner.from('schools').select('configured_shifts').eq('id', schoolId).single()
    expect(school!.configured_shifts).toEqual([])
  })

  it('rejects a configured_shifts value outside the fixed vocabulary (DB CHECK)', async () => {
    const { error } = await owner.from('schools').update({ configured_shifts: ['Noon'] }).eq('id', schoolId)
    expect(error).not.toBeNull()
  })

  it("narrowing configured_shifts never rewrites an existing Class Offering's shift", async () => {
    await owner.from('schools').update({ configured_shifts: ['Morning', 'Day'] }).eq('id', schoolId)
    const { data: cls } = await owner.from('class_offerings').select('shift').eq('id', classId).single()
    expect(cls!.shift).toBe('Evening') // unchanged, even though 'Evening' is no longer configured
  })

  it("narrowing configured_shifts never rewrites an existing Employee's Shift assignment", async () => {
    const { data: assignment } = await owner
      .from('employee_academic_shifts')
      .select('shift')
      .eq('employee_id', employeeId)
      .eq('shift', 'Evening')
      .maybeSingle()
    expect(assignment).not.toBeNull() // still there, untouched by the narrowing above
  })

  it('widening configured_shifts back does not need to "restore" anything — nothing was ever removed', async () => {
    await owner.from('schools').update({ configured_shifts: ['Morning', 'Day', 'Evening'] }).eq('id', schoolId)
    const { data: cls } = await owner.from('class_offerings').select('shift').eq('id', classId).single()
    expect(cls!.shift).toBe('Evening')
  })
})
