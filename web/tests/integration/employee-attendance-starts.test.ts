import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn, PASSWORD } from '../helpers/auth'

// WRITTEN FOR MIGRATION 0217 — NOT RUN. The migration is unapplied; the
// database behind .env.local is shared by staging and production, so this
// file waits for a branch database with 0217 on it.
//
// Seam: employee_attendance_starts() (issues #693/#694) gives each non-archived
// Employee's attendance start day to the School Owner and to a Staff User who
// holds the `attendance` Permission Grant — and to no one else — scoped to the
// caller's own School, two columns only. staff-e2e@test.local is School A's
// Staff User (supabase/e2e-seed.sql).

const STAFF = 'staff-e2e@test.local'
const STAFF_ID = '44444444-4444-4444-4444-444444444444'
const MARK = 'Start Day Test Employee'

describe('employee_attendance_starts() (0217)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let staff: SupabaseClient
  let aId: string
  let bId: string

  const startsOf = async (c: SupabaseClient) => {
    const { data, error } = await c.rpc('employee_attendance_starts')
    expect(error).toBeNull()
    return (data ?? []) as { employee_id: string; start_day: string }[]
  }

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    staff = await signedIn(STAFF, PASSWORD)

    // joining_date far in the past, so start_day is the Dhaka day of created_at.
    const a = await ownerA.from('employees').insert({ full_name: `${MARK} A`, joining_date: '2001-01-01' }).select('id').single()
    const b = await ownerB.from('employees').insert({ full_name: `${MARK} B`, joining_date: '2001-01-01' }).select('id').single()
    if (a.error || b.error) throw new Error(a.error?.message ?? b.error?.message)
    aId = a.data.id
    bId = b.data.id

    await ownerA.from('staff_permissions').delete().eq('staff_user_id', STAFF_ID)
    const grant = await ownerA.from('staff_permissions').insert({ staff_user_id: STAFF_ID, screen_key: 'attendance' })
    if (grant.error) throw new Error(grant.error.message)
  })

  afterAll(async () => {
    await ownerA.from('staff_permissions').delete().eq('staff_user_id', STAFF_ID)
    await ownerA.from('employees').delete().eq('id', aId)
    await ownerB.from('employees').delete().eq('id', bId)
  })

  it('the School Owner gets their own School\'s employees', async () => {
    const rows = await startsOf(ownerA)
    expect(rows.map((r) => r.employee_id)).toContain(aId)
  })

  it('start_day is the later of joining_date and the Dhaka day of created_at', async () => {
    const { data: e } = await ownerA.from('employees').select('created_at').eq('id', aId).single()
    const dhakaDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date(e!.created_at))
    const row = (await startsOf(ownerA)).find((r) => r.employee_id === aId)
    expect(row?.start_day).toBe(dhakaDay)
  })

  it('a Staff User holding the attendance grant gets rows, though employees itself stays unreadable to them', async () => {
    const { data: direct } = await staff.from('employees').select('id').eq('id', aId)
    expect(direct ?? []).toHaveLength(0)
    const rows = await startsOf(staff)
    expect(rows.map((r) => r.employee_id)).toContain(aId)
  })

  it('a Staff User without the attendance grant gets nothing', async () => {
    await ownerA.from('staff_permissions').delete().eq('staff_user_id', STAFF_ID)
    expect(await startsOf(staff)).toHaveLength(0)
    await ownerA.from('staff_permissions').insert({ staff_user_id: STAFF_ID, screen_key: 'attendance' })
  })

  it("another School's employees never appear, for the Owner or the granted Staff User", async () => {
    for (const c of [ownerA, staff]) {
      expect((await startsOf(c)).map((r) => r.employee_id)).not.toContain(bId)
    }
    expect((await startsOf(ownerB)).map((r) => r.employee_id)).not.toContain(aId)
  })

  it('exposes only employee_id and start_day', async () => {
    const rows = await startsOf(ownerA)
    for (const r of rows) expect(Object.keys(r).sort()).toEqual(['employee_id', 'start_day'])
  })

  it('an archived employee is not listed', async () => {
    await ownerA.from('employees').update({ archived_at: new Date().toISOString() }).eq('id', aId)
    expect((await startsOf(ownerA)).map((r) => r.employee_id)).not.toContain(aId)
    await ownerA.from('employees').update({ archived_at: null }).eq('id', aId)
  })

  it('anon cannot call it', async () => {
    const { createClient } = await import('@supabase/supabase-js')
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    const { data, error } = await anon.rpc('employee_attendance_starts')
    expect(error !== null || (data ?? []).length === 0).toBe(true)
  })
})
