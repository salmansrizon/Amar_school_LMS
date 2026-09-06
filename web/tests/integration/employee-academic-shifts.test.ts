import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// Employee multi-shift assignment (issue #580, Wave 5/#590): a permanent
// fact about the Employee, stored independently of employee_office_times.
// No school_id column on employee_academic_shifts — tenant isolation is
// implicit via the employee_id join (mirroring employee_office_times' own
// shape), so this test reuses employees-grace.test.ts's "foreign owner
// can't see/touch the employee" pattern rather than the office_times file's
// second half (a foreign *related row* case), since shift is a plain
// CHECK-constrained enum, not a foreign key to another tenant-scoped table.

describe('Employee multi-shift assignment (issue #580)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let employeeId: string

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    // Idempotent cleanup of prior runs.
    await ownerA.from('employees').delete().eq('full_name', 'Shift Test Employee')

    const { data: emp, error } = await ownerA
      .from('employees')
      .insert({ full_name: 'Shift Test Employee' })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    employeeId = emp!.id
  })

  afterAll(async () => {
    await ownerA.from('employees').delete().eq('id', employeeId)
  })

  it('an Employee can be assigned to multiple Shifts', async () => {
    const { error } = await ownerA.from('employee_academic_shifts').insert([
      { employee_id: employeeId, shift: 'Day' },
      { employee_id: employeeId, shift: 'Evening' },
    ])
    expect(error).toBeNull()

    const { data } = await ownerA.from('employee_academic_shifts').select('shift').eq('employee_id', employeeId)
    expect((data ?? []).map((r) => r.shift).sort()).toEqual(['Day', 'Evening'])
  })

  it('rejects a Shift value outside the fixed vocabulary', async () => {
    const { error } = await ownerA
      .from('employee_academic_shifts')
      .insert({ employee_id: employeeId, shift: 'Noon' })
    expect(error).not.toBeNull()
  })

  it('assigning the same Shift twice is a no-op, not a second row (composite PK)', async () => {
    await ownerA.from('employee_academic_shifts').upsert({ employee_id: employeeId, shift: 'Day' })
    const { data } = await ownerA
      .from('employee_academic_shifts')
      .select('shift')
      .eq('employee_id', employeeId)
      .eq('shift', 'Day')
    expect(data).toHaveLength(1)
  })

  it("another School's Owner cannot see the Employee", async () => {
    const { data } = await ownerB.from('employees').select('id').eq('id', employeeId)
    expect(data).toEqual([])
  })

  it("another School's Owner cannot read this Employee's Shift assignments", async () => {
    const { data } = await ownerB.from('employee_academic_shifts').select('shift').eq('employee_id', employeeId)
    expect(data).toEqual([])
  })

  it("another School's Owner cannot assign a Shift to this Employee", async () => {
    const { error } = await ownerB
      .from('employee_academic_shifts')
      .insert({ employee_id: employeeId, shift: 'Night' })
    expect(error).not.toBeNull()

    const { data } = await ownerA
      .from('employee_academic_shifts')
      .select('shift')
      .eq('employee_id', employeeId)
      .eq('shift', 'Night')
    expect(data).toEqual([])
  })

  it("another School's Owner cannot remove this Employee's Shift assignment", async () => {
    await ownerB.from('employee_academic_shifts').delete().eq('employee_id', employeeId).eq('shift', 'Day')
    const { data } = await ownerA
      .from('employee_academic_shifts')
      .select('shift')
      .eq('employee_id', employeeId)
      .eq('shift', 'Day')
    expect(data).toHaveLength(1)
  })
})
