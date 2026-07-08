import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Seam: students + behaviour_log_entries schema, school RLS, 3-day lock (issue #7).
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const PASSWORD = 'test-password-123!'

async function signedIn(email: string): Promise<SupabaseClient> {
  const client = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`login failed for ${email}: ${error.message}`)
  return client
}

describe('Minimal Student record + Behaviour Log (issue #7)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let admin: SupabaseClient
  let studentId: string

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    admin = await signedIn('super@test.local')
    await ownerA.from('students').delete().eq('full_name', 'Behaviour Test Student')
  })

  afterAll(async () => {
    await admin.from('students').delete().eq('full_name', 'Behaviour Test Student')
  })

  it('a minimal Student can be created and looked up', async () => {
    const { data, error } = await ownerA
      .from('students')
      .insert({ full_name: 'Behaviour Test Student', class_name: 'Five', section: 'A' })
      .select('id, school_id')
      .single()
    expect(error).toBeNull()
    expect(data!.school_id).not.toBeNull() // school_id auto-filled from the owner's school
    studentId = data!.id

    const { data: found } = await ownerA.from('students').select('full_name').eq('id', studentId)
    expect(found![0].full_name).toBe('Behaviour Test Student')
  })

  it("another School's Owner cannot see the Student", async () => {
    const { data } = await ownerB.from('students').select('id').eq('id', studentId)
    expect(data).toEqual([])
  })

  it('a Behaviour Log entry can be added with note + rating + remind date', async () => {
    const { error } = await ownerA.from('behaviour_log_entries').insert({
      student_id: studentId,
      note: 'Disrupted class',
      rating: 2,
      remind_date: '2026-08-01',
    })
    expect(error).toBeNull()
  })

  it('an entry younger than 3 days is editable — even if its text describes an old incident', async () => {
    const { data: entry } = await ownerA
      .from('behaviour_log_entries')
      .select('id')
      .eq('student_id', studentId)
      .single()
    const { error } = await ownerA
      .from('behaviour_log_entries')
      .update({ note: 'Incident happened back on 2024-01-15: disrupted class' })
      .eq('id', entry!.id)
    expect(error).toBeNull()
  })

  it('an entry older than 3 days is locked server-side (anchored to created_at)', async () => {
    // Backdate created_at (super admin), then try to edit as the owner.
    const { data: entry } = await ownerA
      .from('behaviour_log_entries')
      .select('id')
      .eq('student_id', studentId)
      .single()
    const { error: backdateErr } = await admin
      .from('behaviour_log_entries')
      .update({ created_at: new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString() })
      .eq('id', entry!.id)
    expect(backdateErr).toBeNull()

    const { error } = await ownerA
      .from('behaviour_log_entries')
      .update({ note: 'trying to rewrite history' })
      .eq('id', entry!.id)
    expect(error).not.toBeNull()

    const { error: deleteErr } = await ownerA.from('behaviour_log_entries').delete().eq('id', entry!.id)
    expect(deleteErr).not.toBeNull()
  })

  it('ratings support a rolling average across multiple entries', async () => {
    await ownerA.from('behaviour_log_entries').insert([
      { student_id: studentId, note: 'Helped a classmate', rating: 5 },
      { student_id: studentId, note: 'Late homework', rating: 3 },
    ])
    const { data } = await ownerA
      .from('behaviour_log_entries')
      .select('rating')
      .eq('student_id', studentId)
    const ratings = data!.map((r) => r.rating)
    expect(ratings).toHaveLength(3)
    expect(ratings.reduce((a, b) => a + b, 0) / ratings.length).toBeCloseTo(10 / 3)
  })
})
