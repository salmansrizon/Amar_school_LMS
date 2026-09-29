import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// Seam: standing_grace_rules + effective_grace_minutes (issue #9, redesigned
// by #671 and #673 / ADR 0032). The MAX-across-levels rule runs over every
// Standing Grace Rule covering the Employee's Category, whatever the rule's
// Shift — Shift is display-only.

const DETAILS = ['Prayer', 'Lunch Hour'] as const

describe('Considerable Grace Window via Standing Grace Rules (issue #673)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let employeeId: string

  async function grace(): Promise<number> {
    const { data, error } = await ownerA.rpc('effective_grace_minutes', { emp: employeeId })
    if (error) throw new Error(error.message)
    return data as number
  }

  async function save(shift: string | null, detail: string, minutes: number, categories: string[]) {
    const { error } = await ownerA.rpc('save_standing_grace_rule', {
      p_shift: shift,
      p_grace_detail: detail,
      p_grace_minutes: minutes,
      p_categories: categories,
    })
    if (error) throw new Error(error.message)
  }

  async function cleanup() {
    await ownerA.from('employees').delete().eq('full_name', 'Grace Test Employee')
    await ownerA.from('standing_grace_rules').delete().in('grace_detail', DETAILS)
  }

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    await cleanup()

    const { data: emp, error } = await ownerA
      .from('employees')
      .insert({ full_name: 'Grace Test Employee', category: 'Librarian' })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    employeeId = emp!.id
  })

  afterAll(cleanup)

  it('nothing configured means zero grace', async () => {
    expect(await grace()).toBe(0)
  })

  it('a rule covering the Category is picked up', async () => {
    await save(null, 'Prayer', 15, ['Librarian', 'Nurse'])
    expect(await grace()).toBe(15)
  })

  it('a rule filed under another Shift still applies (Shift is display-only)', async () => {
    await save('Morning', 'Lunch Hour', 30, ['Librarian'])
    expect(await grace()).toBe(30)
  })

  it('re-saving the same Shift + Grace Detail replaces its Categories and minutes, never duplicates', async () => {
    await save('Morning', 'Lunch Hour', 10, ['Nurse'])
    const { data } = await ownerA
      .from('standing_grace_rules')
      .select('id')
      .eq('shift', 'Morning')
      .eq('grace_detail', 'Lunch Hour')
    expect(data).toHaveLength(1)
    expect(await grace()).toBe(15) // Librarian dropped from Lunch Hour; Prayer 15 remains
  })

  it('rejects a category that is not a known Employee Category', async () => {
    const { error } = await ownerA.rpc('save_standing_grace_rule', {
      p_shift: null,
      p_grace_detail: 'Prayer',
      p_grace_minutes: 5,
      p_categories: ['not-a-real-category'],
    })
    expect(error).not.toBeNull()
  })

  it('deleting a rule removes its grace', async () => {
    await ownerA.from('standing_grace_rules').delete().eq('grace_detail', 'Prayer').is('shift', null)
    expect(await grace()).toBe(0)
  })

  it("another School's Owner cannot see the rules", async () => {
    await save(null, 'Prayer', 15, ['Librarian'])
    const { data } = await ownerB.from('standing_grace_rules').select('id').in('grace_detail', DETAILS)
    expect(data).toEqual([])
  })

  it('the one-call school-wide grace list matches the per-employee value', async () => {
    const { data } = await ownerA.rpc('effective_grace_for_my_school')
    const rows = data as { employee_id: string; grace: number }[]
    expect(rows.find((r) => r.employee_id === employeeId)?.grace).toBe(await grace())
  })
})
