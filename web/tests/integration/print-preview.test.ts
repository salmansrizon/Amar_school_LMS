import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Seam: the data the mark-sheet preview printable reads (issue #25) —
// own school name and latest exam, through anon key + RLS.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const PASSWORD = 'test-password-123!'

describe('Mark-sheet preview data (issue #25)', () => {
  let ownerA: SupabaseClient

  beforeAll(async () => {
    ownerA = createClient(URL, ANON, { auth: { persistSession: false } })
    const { error } = await ownerA.auth.signInWithPassword({
      email: 'owner-a@test.local',
      password: PASSWORD,
    })
    if (error) throw new Error(`login failed: ${error.message}`)
  })

  it('an owner reads exactly their own school name for the institute header', async () => {
    const { data, error } = await ownerA.from('schools').select('name').single()
    expect(error).toBeNull()
    expect(data?.name).toBeTruthy()
  })

  it('the latest-exam query returns at most one row without error', async () => {
    const { error, data } = await ownerA
      .from('exams')
      .select('name, exam_year')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    expect(error).toBeNull()
    // Zero exams is a valid state — the page falls back to a sample title.
    if (data) expect(data.name).toBeTruthy()
  })
})
