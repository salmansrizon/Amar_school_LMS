import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Seam: per-class syllabus metadata + Storage tenancy (issue #45). The file
// bytes go through Storage RLS (folder = school_id); here we cover the metadata
// row RLS and the private-bucket read scoping.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const PASSWORD = 'test-password-123!'
const TAG = 'SY45'

async function signedIn(email: string): Promise<SupabaseClient> {
  const client = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`login failed for ${email}: ${error.message}`)
  return client
}

describe('Class syllabus (issue #45)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let classId: string
  let schoolAId: string

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    const cls = (await ownerA.from('classes').insert({ name: `${TAG} Class` }).select('id, school_id').single()).data!
    classId = cls.id
    schoolAId = cls.school_id
  })

  afterAll(async () => {
    if (!ownerA) return
    await ownerA.from('class_syllabi').delete().eq('class_id', classId)
    await ownerA.from('classes').delete().eq('id', classId)
  })

  it('records and replaces a syllabus row (one per class)', async () => {
    const path = `${schoolAId}/${classId}.pdf`
    const { error: e1 } = await ownerA
      .from('class_syllabi')
      .upsert({ class_id: classId, storage_path: path, file_name: 'v1.pdf' }, { onConflict: 'class_id' })
    expect(e1).toBeNull()
    // Replace edits the same row in place (primary key on class_id).
    const { error: e2 } = await ownerA
      .from('class_syllabi')
      .upsert({ class_id: classId, storage_path: path, file_name: 'v2.pdf' }, { onConflict: 'class_id' })
    expect(e2).toBeNull()
    const { data } = await ownerA.from('class_syllabi').select('file_name').eq('class_id', classId).single()
    expect(data!.file_name).toBe('v2.pdf')
  })

  it('RLS: another school cannot see this class syllabus row', async () => {
    const { data } = await ownerB.from('class_syllabi').select('class_id').eq('class_id', classId)
    expect(data?.length ?? 0).toBe(0)
  })

  it('Storage RLS: a member cannot write into another school folder', async () => {
    // ownerB tries to upload into school A's folder — the folder policy rejects it.
    const bytes = new Blob([new Uint8Array([37, 80, 68, 70])], { type: 'application/pdf' }) // %PDF
    const { error } = await ownerB.storage.from('syllabus').upload(`${schoolAId}/${classId}.pdf`, bytes, {
      upsert: true,
      contentType: 'application/pdf',
    })
    expect(error).not.toBeNull()
  })
})
