import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Seam: employees profile columns + soft-archive/restore (issue #28). The
// office-time/grace machinery (officeTimes, category grace, effective_grace_*)
// predates this ticket and is exercised by tests/integration/grace.test.ts.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const PASSWORD = 'test-password-123!'

const MARK = 'Profile Test Employee'

async function signedIn(email: string): Promise<SupabaseClient> {
  const client = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`login failed for ${email}: ${error.message}`)
  return client
}

describe('Employees I — full profile, archive, restore (issue #28)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let admin: SupabaseClient
  let employeeId: string

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    admin = await signedIn('super@test.local')
    await admin.from('employees').delete().like('full_name', `${MARK}%`)
  })

  afterAll(async () => {
    await admin.from('employees').delete().like('full_name', `${MARK}%`)
  })

  it('a full profile can be saved and read back', async () => {
    const { data, error } = await ownerA
      .from('employees')
      .insert({
        full_name: `${MARK} One`,
        mobile: '01700000000',
        date_of_birth: '1990-04-05',
        joining_date: '2018-01-10',
        bank_name: 'Sonali Bank',
        bank_branch: 'Basail Branch',
        bank_account: '2000000000',
        category: 'Teacher',
        qualification: 'M.A., B.Ed.',
        department: 'Bangla Dept.',
        subject_taught: 'Bangla 1st & 2nd Paper',
      })
      .select(
        'id, school_id, mobile, bank_name, qualification, department, subject_taught, archived_at',
      )
      .single()
    expect(error).toBeNull()
    expect(data!.school_id).not.toBeNull()
    expect(data!.mobile).toBe('01700000000')
    expect(data!.bank_name).toBe('Sonali Bank')
    expect(data!.qualification).toBe('M.A., B.Ed.')
    expect(data!.department).toBe('Bangla Dept.')
    expect(data!.subject_taught).toBe('Bangla 1st & 2nd Paper')
    expect(data!.archived_at).toBeNull()
    employeeId = data!.id
  })

  it("another School's Owner cannot see the profile", async () => {
    const { data } = await ownerB.from('employees').select('id').eq('id', employeeId)
    expect(data).toEqual([])
  })

  it('a profile field can be edited', async () => {
    const { data, error } = await ownerA
      .from('employees')
      .update({ department: 'Science Dept.' })
      .eq('id', employeeId)
      .select('department')
      .single()
    expect(error).toBeNull()
    expect(data!.department).toBe('Science Dept.')
  })

  it('archive hides the employee from the active list but keeps the row', async () => {
    const { data, error } = await ownerA
      .from('employees')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', employeeId)
      .select('archived_at')
      .single()
    expect(error).toBeNull()
    expect(data!.archived_at).not.toBeNull()

    const { data: active } = await ownerA
      .from('employees')
      .select('id')
      .eq('id', employeeId)
      .is('archived_at', null)
    expect(active).toEqual([])

    const { data: archived } = await ownerA
      .from('employees')
      .select('id')
      .eq('id', employeeId)
      .not('archived_at', 'is', null)
    expect(archived).toEqual([{ id: employeeId }])
  })

  it("another School's Owner cannot archive or restore the employee", async () => {
    const { data } = await ownerB
      .from('employees')
      .update({ archived_at: null })
      .eq('id', employeeId)
      .select('id')
    expect(data).toEqual([]) // RLS hides the row: 0 rows affected, no error
  })

  it('restore clears the archive mark', async () => {
    const { data, error } = await ownerA
      .from('employees')
      .update({ archived_at: null })
      .eq('id', employeeId)
      .select('archived_at')
      .single()
    expect(error).toBeNull()
    expect(data!.archived_at).toBeNull()
  })

  it('grace resolution is unaffected by the new profile columns', async () => {
    const { data, error } = await ownerA.rpc('effective_grace_minutes', { emp: employeeId })
    expect(error).toBeNull()
    expect(typeof data).toBe('number')
  })
})
