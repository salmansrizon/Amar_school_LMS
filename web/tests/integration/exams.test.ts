import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Seam: exams schema + Closed-state immutability (issue #8).
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const PASSWORD = 'test-password-123!'
const STAFF_EMAIL = 'staff-a1@test.local'

async function signedIn(email: string): Promise<SupabaseClient> {
  const client = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`login failed for ${email}: ${error.message}`)
  return client
}

describe('Exam entity + Closed state (issue #8)', () => {
  let ownerA: SupabaseClient
  let examId: string

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    // Closed exams are undeletable by school roles (by design) — clean up
    // prior runs as Super Admin, who is exempt for vendor-side maintenance.
    const admin = await signedIn('super@test.local')
    const { error } = await admin.from('exams').delete().eq('name', 'Closed State Test Exam')
    if (error) throw new Error(`cleanup failed: ${error.message}`)
  })

  it('an Exam can be created Open and edited freely', async () => {
    const { data, error } = await ownerA
      .from('exams')
      .insert({ name: 'Closed State Test Exam', exam_year: 2026 })
      .select('id, status')
      .single()
    expect(error).toBeNull()
    expect(data!.status).toBe('open')
    examId = data!.id

    const { error: editErr } = await ownerA
      .from('exams')
      .update({ name: 'Closed State Test Exam' })
      .eq('id', examId)
    expect(editErr).toBeNull()
  })

  it('a Staff User closes an exam with no permission beyond ordinary screen access', async () => {
    // The screen-level allow-list (issue #2) is the ONLY gate; the RPC checks
    // school membership, no elevated permission (PRD §5.5 verified rule).
    const staff = await signedIn(STAFF_EMAIL)
    const { error } = await staff.rpc('close_exam', { exam: examId })
    expect(error).toBeNull()
    const { data } = await ownerA.from('exams').select('status, closed_at').eq('id', examId).single()
    expect(data!.status).toBe('closed')
    expect(data!.closed_at).not.toBeNull()
  })

  it('closing an already-closed exam errors', async () => {
    const { error } = await ownerA.rpc('close_exam', { exam: examId })
    expect(error).not.toBeNull()
  })

  it('no path reopens a Closed exam', async () => {
    const { error: directErr } = await ownerA.from('exams').update({ status: 'open' }).eq('id', examId)
    expect(directErr).not.toBeNull()
  })

  it('all edits on a Closed exam are rejected server-side', async () => {
    const { error } = await ownerA.from('exams').update({ name: 'renamed' }).eq('id', examId)
    expect(error).not.toBeNull()
    const { error: delErr } = await ownerA.from('exams').delete().eq('id', examId)
    expect(delErr).not.toBeNull()
  })

  it("another School's Owner cannot see the exam", async () => {
    const ownerB = await signedIn('owner-b@test.local')
    const { data } = await ownerB.from('exams').select('id').eq('id', examId)
    expect(data).toEqual([])
  })
})
