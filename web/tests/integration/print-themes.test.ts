import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { resolveTheme, DEFAULT_THEME_KEY } from '@/lib/print-themes'

// Seam: per-school admit-card palette (issue #94, migration 0058). Stored
// keyed by document type so a second themed printable is a row, not a schema
// change; owner-writable, member-readable (every printable reads it).
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const PASSWORD = 'test-password-123!'

function anonClient() {
  return createClient(URL, ANON, { auth: { persistSession: false } })
}

async function signedIn(email: string): Promise<SupabaseClient> {
  const client = anonClient()
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`login failed for ${email}: ${error.message}`)
  return client
}

describe('Admit card print themes (issue #94)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let staff: SupabaseClient
  let schoolAId: string

  beforeAll(async () => {
    ;[ownerA, ownerB, staff] = await Promise.all([
      signedIn('owner-a@test.local'),
      signedIn('owner-b@test.local'),
      signedIn('staff-a1@test.local'),
    ])
    const { data: userA } = await ownerA.auth.getUser()
    schoolAId = (
      await ownerA.from('profiles').select('school_id').eq('id', userA.user!.id).single()
    ).data!.school_id
    await ownerA.from('school_print_themes').delete().eq('school_id', schoolAId)
  })

  afterAll(async () => {
    await ownerA.from('school_print_themes').delete().eq('school_id', schoolAId)
  })

  it('an unset school falls back to the plain default', async () => {
    const { data } = await ownerA
      .from('school_print_themes')
      .select('palette_key')
      .eq('doc_type', 'admit-card')
      .maybeSingle()
    expect(resolveTheme(undefined, data?.palette_key ?? null).key).toBe(DEFAULT_THEME_KEY)
  })

  it('the Owner saves a default and a Staff User can read it for printing', async () => {
    const { error } = await ownerA
      .from('school_print_themes')
      .upsert({ doc_type: 'admit-card', palette_key: 'slate' }, { onConflict: 'school_id,doc_type' })
    expect(error).toBeNull()

    const { data } = await staff
      .from('school_print_themes')
      .select('palette_key')
      .eq('doc_type', 'admit-card')
      .maybeSingle()
    expect(data?.palette_key).toBe('slate')
    // A per-print override still wins over the saved default.
    expect(resolveTheme('sage', data!.palette_key).key).toBe('sage')
  })

  it('one row per document type — re-saving replaces rather than accumulates', async () => {
    await ownerA
      .from('school_print_themes')
      .upsert({ doc_type: 'admit-card', palette_key: 'maroon' }, { onConflict: 'school_id,doc_type' })
    const { data } = await ownerA
      .from('school_print_themes')
      .select('palette_key')
      .eq('doc_type', 'admit-card')
    expect(data).toHaveLength(1)
    expect(data![0].palette_key).toBe('maroon')
  })

  it('rejects a document type outside the themed set', async () => {
    const { error } = await ownerA
      .from('school_print_themes')
      .insert({ doc_type: 'mark-sheet', palette_key: 'slate' })
    expect(error).not.toBeNull()
  })

  it('a Staff User cannot change the school default', async () => {
    const { data } = await staff
      .from('school_print_themes')
      .update({ palette_key: 'sand' })
      .eq('doc_type', 'admit-card')
      .select()
    expect(data).toEqual([])
  })

  it("another school's Owner sees none of it", async () => {
    const { data } = await ownerB
      .from('school_print_themes')
      .select('palette_key')
      .eq('school_id', schoolAId)
    expect(data).toEqual([])
  })
})
