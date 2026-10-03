import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// Seam: behaviour_entry_triage RLS (issue #672, migration 0209). A triage row is
// reachable exactly when its Behaviour Log Entry is — the policy delegates to
// behaviour_log_entries' own RLS rather than restating it.

const NAME = 'Behaviour Triage Test Student'

const ROW = {
  note_sha256: 'a'.repeat(64),
  model: 'jev-test',
  severity: 3.1,
  severity_confidence: 0.8,
  severity_probs: { 3: 0.8, 4: 0.2 },
  parent_contact_p: 0.9,
  category: 'conduct',
  category_confidence: 0.8,
  category_probs: { conduct: 0.8, bullying: 0.2 },
}

describe('Behaviour Log advisory triage RLS (#672)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let student: SupabaseClient
  let admin: SupabaseClient
  let entryId: string

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    student = await signedIn('s9001@test-a.students.invalid')
    admin = await signedIn('super@test.local')
    await admin.from('students').delete().eq('full_name', NAME)

    const { data: s } = await ownerA.from('students').insert({ full_name: NAME }).select('id').single()
    const { data: e } = await ownerA
      .from('behaviour_log_entries')
      .insert({ student_id: s!.id, note: 'Hit a classmate', rating: 2 })
      .select('id')
      .single()
    entryId = e!.id
  })

  afterAll(async () => {
    await admin.from('students').delete().eq('full_name', NAME)
  })

  it("another School's Owner cannot attach triage to the entry", async () => {
    const { error } = await ownerB.from('behaviour_entry_triage').insert({ entry_id: entryId, ...ROW })
    expect(error).not.toBeNull()
  })

  it("the entry's own School writes and reads its triage", async () => {
    const { error } = await ownerA.from('behaviour_entry_triage').insert({ entry_id: entryId, ...ROW })
    expect(error).toBeNull()
    const { data } = await ownerA.from('behaviour_entry_triage').select('category').eq('entry_id', entryId)
    expect(data).toEqual([{ category: 'conduct' }])
  })

  it("another School's Owner cannot read it", async () => {
    const { data } = await ownerB.from('behaviour_entry_triage').select('entry_id').eq('entry_id', entryId)
    expect(data).toEqual([])
  })

  it('a Student reads no triage at all', async () => {
    const { data } = await student.from('behaviour_entry_triage').select('entry_id')
    expect(data ?? []).toEqual([])
  })

  it('rejects a category outside the fixed set', async () => {
    const { error } = await ownerA
      .from('behaviour_entry_triage')
      .update({ category: 'praise' })
      .eq('entry_id', entryId)
    expect(error).not.toBeNull()
  })

  it('goes away with its entry', async () => {
    await ownerA.from('behaviour_log_entries').delete().eq('id', entryId)
    const { data } = await admin.from('behaviour_entry_triage').select('entry_id').eq('entry_id', entryId)
    expect(data).toEqual([])
  })
})
