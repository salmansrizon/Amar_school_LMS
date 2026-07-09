import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Seam: student subject assignment + tenancy (issue #46).
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const PASSWORD = 'test-password-123!'
const TAG = 'SS46'

async function signedIn(email: string): Promise<SupabaseClient> {
  const client = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`login failed for ${email}: ${error.message}`)
  return client
}

describe('Student subject assignment (issue #46)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let studentId: string
  let subjectId: string

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    studentId = (await ownerA.from('students').insert({ full_name: `${TAG} Stu`, class_name: `${TAG}C` }).select('id').single()).data!.id
    subjectId = (await ownerA.from('subjects').insert({ name: `${TAG} Sub`, theory_marks: 100 }).select('id').single()).data!.id
  })

  afterAll(async () => {
    if (!ownerA) return
    await ownerA.from('student_subjects').delete().eq('student_id', studentId)
    await ownerA.from('students').delete().eq('id', studentId)
    await ownerA.from('subjects').delete().eq('id', subjectId)
    await ownerB.from('students').delete().like('full_name', `${TAG}%`)
    await ownerB.from('subjects').delete().like('name', `${TAG}%`)
  })

  it('assigns a subject (compulsory by default) and flips optional', async () => {
    const { error } = await ownerA
      .from('student_subjects')
      .upsert({ student_id: studentId, subject_id: subjectId, is_optional: false }, { onConflict: 'student_id,subject_id' })
    expect(error).toBeNull()
    const { error: e2 } = await ownerA
      .from('student_subjects')
      .upsert({ student_id: studentId, subject_id: subjectId, is_optional: true }, { onConflict: 'student_id,subject_id' })
    expect(e2).toBeNull()
    const { data } = await ownerA.from('student_subjects').select('is_optional').eq('student_id', studentId).single()
    expect(data!.is_optional).toBe(true)
  })

  it('rejects assigning a subject from another school (same-school trigger)', async () => {
    const foreignSubject = (await ownerB.from('subjects').insert({ name: `${TAG} Foreign`, theory_marks: 100 }).select('id').single()).data!
    const { error } = await ownerA
      .from('student_subjects')
      .insert({ student_id: studentId, subject_id: foreignSubject.id })
    expect(error).not.toBeNull()
  })

  it('RLS: another school cannot see the assignment', async () => {
    const { data } = await ownerB.from('student_subjects').select('subject_id').eq('student_id', studentId)
    expect(data?.length ?? 0).toBe(0)
  })
})
