import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Seam: Class & Curriculum I — classes, rooms, subject catalogue (issue #26).
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const PASSWORD = 'test-password-123!'

async function signedIn(email: string): Promise<SupabaseClient> {
  const client = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`login failed for ${email}: ${error.message}`)
  return client
}

const TAG = 'CC26' // marks rows this suite creates, for isolated cleanup

describe('Class & Curriculum I (issue #26)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
  })

  afterAll(async () => {
    if (!ownerA) return
    for (const table of ['subjects', 'rooms', 'classes'] as const) {
      await ownerA.from(table).delete().like('name', `${TAG}%`)
    }
  })

  it('creates a class with optional fields and defaults school_id from the caller', async () => {
    const { data, error } = await ownerA
      .from('classes')
      .insert({ name: `${TAG} Six`, section: 'A', education_level: 'Secondary', group_department: 'Science' })
      .select('id, school_id, name, section')
      .single()
    expect(error).toBeNull()
    expect(data!.school_id).not.toBeNull()
    expect(data!.section).toBe('A')
  })

  it('rejects a room with non-positive capacity', async () => {
    const { error } = await ownerA.from('rooms').insert({ name: `${TAG} Hall`, capacity: 0 })
    expect(error).not.toBeNull()
  })

  it('creates a room with positive capacity', async () => {
    const { data, error } = await ownerA
      .from('rooms')
      .insert({ name: `${TAG} Hall 1`, capacity: 40 })
      .select('id, capacity')
      .single()
    expect(error).toBeNull()
    expect(data!.capacity).toBe(40)
  })

  it('creates a subject with Theory/MCQ/Practical + multi-paper config', async () => {
    const { data, error } = await ownerA
      .from('subjects')
      .insert({ name: `${TAG} Bangla`, code: 'BAN', theory_marks: 70, mcq_marks: 30, practical_marks: 0, paper_count: 2 })
      .select('id, theory_marks, mcq_marks, paper_count')
      .single()
    expect(error).toBeNull()
    expect(data!.theory_marks + data!.mcq_marks).toBe(100)
    expect(data!.paper_count).toBe(2)
  })

  it('rejects a subject with no marks in any component', async () => {
    const { error } = await ownerA
      .from('subjects')
      .insert({ name: `${TAG} Empty`, theory_marks: 0, mcq_marks: 0, practical_marks: 0 })
    expect(error).not.toBeNull()
  })

  it('rejects a subject with paper_count out of the 1..4 range', async () => {
    const { error } = await ownerA
      .from('subjects')
      .insert({ name: `${TAG} TooMany`, theory_marks: 100, paper_count: 5 })
    expect(error).not.toBeNull()
  })

  it('RLS: another school cannot see or delete this school rows', async () => {
    // Seed one row as A.
    const { data: created } = await ownerA
      .from('classes')
      .insert({ name: `${TAG} Isolated` })
      .select('id')
      .single()
    expect(created).not.toBeNull()

    // B sees none of A tagged rows.
    const { data: bView } = await ownerB.from('classes').select('id').like('name', `${TAG}%`)
    expect(bView?.length ?? 0).toBe(0)

    // B cannot delete A row (RLS filters it out — no row affected).
    const { data: bDelete } = await ownerB.from('classes').delete().eq('id', created!.id).select('id')
    expect(bDelete?.length ?? 0).toBe(0)

    // A still sees it.
    const { data: aStill } = await ownerA.from('classes').select('id').eq('id', created!.id)
    expect(aStill?.length).toBe(1)
  })
})
