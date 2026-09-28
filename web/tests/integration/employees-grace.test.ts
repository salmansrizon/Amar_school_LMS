import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// Seam: employees schema + effective_grace_minutes (issue #9, redesigned by
// #671/ADR 0030). Office Time and the individual override are retired — the
// MAX-across-levels rule now runs over School default, Category, and that
// Category's own Prayer & Tiffin Window.

describe('Minimal Employee + Considerable Grace Window (issue #9, #671)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let employeeId: string

  async function grace(): Promise<number> {
    const { data, error } = await ownerA.rpc('effective_grace_minutes', { emp: employeeId })
    if (error) throw new Error(error.message)
    return data as number
  }

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    // Idempotent cleanup of prior runs.
    await ownerA.from('employees').delete().eq('full_name', 'Grace Test Employee')
    await ownerA.from('category_grace_minutes').delete().eq('category', 'g-teacher')
    await ownerA.rpc('set_school_default_grace', { minutes: null })

    const { data: emp, error } = await ownerA
      .from('employees')
      .insert({ full_name: 'Grace Test Employee', category: 'g-teacher' })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    employeeId = emp!.id
  })

  afterAll(async () => {
    await ownerA.from('employees').delete().eq('id', employeeId)
    await ownerA.from('category_grace_minutes').delete().eq('category', 'g-teacher')
    await ownerA.rpc('set_school_default_grace', { minutes: null })
  })

  it('nothing configured means zero grace', async () => {
    expect(await grace()).toBe(0)
  })

  it('a category default is picked up', async () => {
    await ownerA.from('category_grace_minutes').insert({ category: 'g-teacher', grace_minutes: 15 })
    expect(await grace()).toBe(15)
  })

  it("that category's own Prayer & Tiffin Window widens the result when larger", async () => {
    await ownerA.from('category_grace_minutes').update({ prayer_tiffin_minutes: 20 }).eq('category', 'g-teacher')
    expect(await grace()).toBe(20) // 20 > 15
  })

  it('a smaller Prayer & Tiffin Window never forces a stricter result than category grace', async () => {
    await ownerA.from('category_grace_minutes').update({ prayer_tiffin_minutes: 5 }).eq('category', 'g-teacher')
    expect(await grace()).toBe(15) // still the max, not the smaller Prayer & Tiffin value
  })

  it('a larger global default wins over everything', async () => {
    await ownerA.rpc('set_school_default_grace', { minutes: 40 })
    expect(await grace()).toBe(40)
  })

  it("another School's Owner cannot see the Employee", async () => {
    const { data } = await ownerB.from('employees').select('id').eq('id', employeeId)
    expect(data).toEqual([])
  })

  it('the one-call school-wide grace list matches the per-employee value', async () => {
    const { data } = await ownerA.rpc('effective_grace_for_my_school')
    const rows = data as { employee_id: string; grace: number }[]
    expect(rows.find((r) => r.employee_id === employeeId)?.grace).toBe(await grace())
  })
})
