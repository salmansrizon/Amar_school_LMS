import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Seam: Class & Curriculum I schema (issue #26, PRD §5.4 first half) —
// classes (unique per name+section), rooms (positive capacity + active flag,
// feeds seat plan), subjects (theory/MCQ/practical marks, multi-paper,
// optional class link), all RLS-scoped.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const PASSWORD = 'test-password-123!'

async function signedIn(email: string): Promise<SupabaseClient> {
  const client = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`login failed for ${email}: ${error.message}`)
  return client
}

describe('Class & Curriculum I (issue #26)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let classId: string

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    // Idempotent re-runs: class delete cascades to its subjects.
    await ownerA.from('classes').delete().eq('name', 'CC Test Class')
    await ownerA.from('subjects').delete().like('name', 'CC %')
    await ownerA.from('rooms').delete().eq('name', 'CC Test Room')
    const { data, error } = await ownerA
      .from('classes')
      .insert({ name: 'CC Test Class', section: 'A', education_level: 'Secondary' })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    classId = data.id
  })

  afterAll(async () => {
    await ownerA.from('classes').delete().eq('id', classId)
    await ownerA.from('subjects').delete().like('name', 'CC %')
    await ownerA.from('rooms').delete().eq('name', 'CC Test Room')
  })

  it('a class is created scoped to the owner school', async () => {
    const { data } = await ownerA
      .from('classes')
      .select('id, name, section')
      .eq('id', classId)
      .single()
    expect(data?.name).toBe('CC Test Class')
    expect(data?.section).toBe('A')
  })

  it('the same class name + section cannot exist twice', async () => {
    const { error } = await ownerA.from('classes').insert({ name: 'CC Test Class', section: 'A' })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('23505')
  })

  it('the same class name may repeat with a different section', async () => {
    const { data, error } = await ownerA
      .from('classes')
      .insert({ name: 'CC Test Class', section: 'B', group_department: 'Science' })
      .select('id')
      .single()
    expect(error).toBeNull()
    await ownerA.from('classes').delete().eq('id', data!.id)
  })

  it('rooms require a positive capacity and default to active', async () => {
    const { error: bad } = await ownerA.from('rooms').insert({ name: 'CC Test Room', capacity: 0 })
    expect(bad).not.toBeNull()
    const { data, error } = await ownerA
      .from('rooms')
      .insert({ name: 'CC Test Room', capacity: 40 })
      .select('id, is_active')
      .single()
    expect(error).toBeNull()
    expect(data?.is_active).toBe(true)
  })

  it('a class subject carries mark config and defaults to a single paper', async () => {
    const { data, error } = await ownerA
      .from('subjects')
      .insert({
        class_id: classId,
        name: 'CC Science',
        theory_marks: 50,
        mcq_marks: 25,
        practical_marks: 25,
      })
      .select('id, paper_count, theory_marks')
      .single()
    expect(error).toBeNull()
    expect(data?.paper_count).toBe(1)
    expect(data?.theory_marks).toBe(50)
  })

  it('a subject with zero marks in every component is rejected', async () => {
    const { error } = await ownerA.from('subjects').insert({ class_id: classId, name: 'CC Empty' })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('subjects_marks_nonzero')
  })

  it('multi-paper subjects record their paper count', async () => {
    const { data, error } = await ownerA
      .from('subjects')
      .insert({ class_id: classId, name: 'CC Bangla', theory_marks: 70, paper_count: 2 })
      .select('paper_count')
      .single()
    expect(error).toBeNull()
    expect(data?.paper_count).toBe(2)
  })

  it('a catalogue subject without a class is still valid (pre-hardening rows)', async () => {
    const { error } = await ownerA
      .from('subjects')
      .insert({ name: 'CC Loose', theory_marks: 100 })
    expect(error).toBeNull()
  })

  it("RLS: another school's owner sees none of it", async () => {
    const { data: classes } = await ownerB.from('classes').select('id').eq('id', classId)
    expect(classes).toHaveLength(0)
    const { data: subjects } = await ownerB.from('subjects').select('id').eq('class_id', classId)
    expect(subjects).toHaveLength(0)
  })

  it('deleting a class cascades to its subjects', async () => {
    const { data: cls } = await ownerA
      .from('classes')
      .insert({ name: 'CC Test Class', section: 'C' })
      .select('id')
      .single()
    await ownerA
      .from('subjects')
      .insert({ class_id: cls!.id, name: 'CC Temp', theory_marks: 100 })
    await ownerA.from('classes').delete().eq('id', cls!.id)
    const { data: left } = await ownerA.from('subjects').select('id').eq('class_id', cls!.id)
    expect(left).toHaveLength(0)
  })
})
