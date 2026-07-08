import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Seam: employees/shifts schema + effective_grace_minutes (issue #9).
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const PASSWORD = 'test-password-123!'

async function signedIn(email: string): Promise<SupabaseClient> {
  const client = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`login failed for ${email}: ${error.message}`)
  return client
}

describe('Minimal Employee + Considerable Grace Window (issue #9)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let employeeId: string
  let morningShift: string
  let dayShift: string

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
    await ownerA.from('shifts').delete().in('name', ['G-Morning', 'G-Day'])
    await ownerA.from('category_grace_minutes').delete().eq('category', 'g-teacher')
    await ownerA.rpc('set_school_default_grace', { minutes: null })

    morningShift = (
      await ownerA.from('shifts').insert({ name: 'G-Morning', grace_minutes: 10 }).select('id').single()
    ).data!.id
    dayShift = (
      await ownerA.from('shifts').insert({ name: 'G-Day', grace_minutes: 25 }).select('id').single()
    ).data!.id

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
    await ownerA.from('shifts').delete().in('id', [morningShift, dayShift])
    await ownerA.from('category_grace_minutes').delete().eq('category', 'g-teacher')
    await ownerA.rpc('set_school_default_grace', { minutes: null })
  })

  it('an Employee can be created and assigned to multiple shifts', async () => {
    const { error } = await ownerA.from('employee_shifts').insert([
      { employee_id: employeeId, shift_id: morningShift },
      { employee_id: employeeId, shift_id: dayShift },
    ])
    expect(error).toBeNull()
  })

  it('two shifts with different grace values resolve to the larger', async () => {
    expect(await grace()).toBe(25)
  })

  it('a larger category default takes over (max across levels)', async () => {
    await ownerA.from('category_grace_minutes').insert({ category: 'g-teacher', grace_minutes: 30 })
    expect(await grace()).toBe(30)
  })

  it('a SMALLER per-individual override does not force a stricter window', async () => {
    await ownerA.from('employees').update({ grace_override_minutes: 5 }).eq('id', employeeId)
    expect(await grace()).toBe(30) // still the max, not the override
  })

  it('a larger global default wins over everything', async () => {
    await ownerA.rpc('set_school_default_grace', { minutes: 40 })
    expect(await grace()).toBe(40)
  })

  it("another School's Owner cannot see the Employee", async () => {
    const { data } = await ownerB.from('employees').select('id').eq('id', employeeId)
    expect(data).toEqual([])
  })
})
