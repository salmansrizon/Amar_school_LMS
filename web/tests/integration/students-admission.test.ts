import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Seam: admission profile + auto-roll + archive + transfer history (issue #27).
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const PASSWORD = 'test-password-123!'
const TAG = 'ST27INT'

async function signedIn(email: string): Promise<SupabaseClient> {
  const client = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`login failed for ${email}: ${error.message}`)
  return client
}

describe('Students admission profile (issue #27)', () => {
  let ownerA: SupabaseClient
  const cls = `${TAG}-CLS`

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
  })

  afterAll(async () => {
    if (!ownerA) return
    const { data } = await ownerA.from('students').select('id').eq('class_name', cls)
    for (const s of data ?? []) {
      await ownerA.from('student_transfers').delete().eq('student_id', s.id)
    }
    await ownerA.from('students').delete().eq('class_name', cls)
  })

  it('auto-assigns sequential roll numbers within a class', async () => {
    const a = (await ownerA.from('students').insert({ full_name: `${TAG} A`, class_name: cls }).select('roll_number').single()).data!
    const b = (await ownerA.from('students').insert({ full_name: `${TAG} B`, class_name: cls }).select('roll_number').single()).data!
    expect(a.roll_number).toBeGreaterThan(0)
    expect(b.roll_number).toBe(a.roll_number + 1)
  })

  it('stores the full profile including benefits flags', async () => {
    const { data, error } = await ownerA
      .from('students')
      .insert({
        full_name: `${TAG} C`,
        class_name: cls,
        village: 'Shalban',
        guardian_name: 'Rafiq',
        is_freedom_fighter_child: true,
      })
      .select('village, guardian_name, is_freedom_fighter_child, is_indigenous')
      .single()
    expect(error).toBeNull()
    expect(data!.village).toBe('Shalban')
    expect(data!.is_freedom_fighter_child).toBe(true)
    expect(data!.is_indigenous).toBe(false)
  })

  it('soft-archives and restores (Old Students)', async () => {
    const s = (await ownerA.from('students').insert({ full_name: `${TAG} D`, class_name: cls }).select('id').single()).data!
    await ownerA.from('students').update({ archived_at: new Date().toISOString() }).eq('id', s.id)
    const archived = (await ownerA.from('students').select('archived_at').eq('id', s.id).single()).data!
    expect(archived.archived_at).not.toBeNull()
    await ownerA.from('students').update({ archived_at: null }).eq('id', s.id)
    const restored = (await ownerA.from('students').select('archived_at').eq('id', s.id).single()).data!
    expect(restored.archived_at).toBeNull()
  })

  it('records a transfer history row', async () => {
    const s = (await ownerA.from('students').insert({ full_name: `${TAG} E`, class_name: cls, section: 'A' }).select('id').single()).data!
    await ownerA.from('students').update({ class_name: cls, section: 'B' }).eq('id', s.id)
    const { error } = await ownerA.from('student_transfers').insert({
      student_id: s.id,
      from_class: cls,
      from_section: 'A',
      to_class: cls,
      to_section: 'B',
    })
    expect(error).toBeNull()
    const { data } = await ownerA.from('student_transfers').select('to_section').eq('student_id', s.id)
    expect(data?.[0]?.to_section).toBe('B')
  })
})
