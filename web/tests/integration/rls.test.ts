import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Seam: the Postgres/RLS boundary of the real Supabase project (issue #1).
// Seed users/schools are created by web/supabase/seed-test.sql:
//   owner-a@test.local / owner-b@test.local (password: test-password-123!)
//   each owning one School ("Test School A" / "Test School B").
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const PASSWORD = 'test-password-123!'

async function signedInClient(email: string): Promise<SupabaseClient> {
  const client = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`login failed for ${email}: ${error.message}`)
  return client
}

describe('RLS: one School cannot read another School’s data', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient

  beforeAll(async () => {
    ownerA = await signedInClient('owner-a@test.local')
    ownerB = await signedInClient('owner-b@test.local')
  })

  it('School Owner A sees exactly their own school', async () => {
    const { data, error } = await ownerA.from('schools').select('name')
    expect(error).toBeNull()
    expect(data).toEqual([{ name: 'Test School A' }])
  })

  it('School Owner B sees exactly their own school', async () => {
    const { data } = await ownerB.from('schools').select('name')
    expect(data).toEqual([{ name: 'Test School B' }])
  })

  it('cross-school profile reads return nothing', async () => {
    const { data: profilesSeenByA } = await ownerA.from('profiles').select('id, role, school_id')
    const { data: schoolA } = await ownerA.from('schools').select('id')
    const schoolAId = schoolA![0].id
    expect(profilesSeenByA!.length).toBeGreaterThan(0)
    for (const p of profilesSeenByA!) expect(p.school_id).toBe(schoolAId)
  })

  it('anonymous clients read nothing', async () => {
    const anon = createClient(URL, ANON, { auth: { persistSession: false } })
    const { data } = await anon.from('schools').select('id')
    expect(data).toEqual([])
  })
})
