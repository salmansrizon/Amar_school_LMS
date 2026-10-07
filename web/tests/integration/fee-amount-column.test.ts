import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// written for migration 0230 — NOT RUN (the migration is not applied, and the
// integration suite writes to the shared database).
// Seam: fee_collection_records.fee_amount, the stored billed fee (#678).

describe('stored fee amount (#678, 0230)', () => {
  let owner: SupabaseClient
  let student: SupabaseClient
  let studentId: string
  let recordId: string

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    student = await signedIn('s9001@test-a.students.invalid')
    expect((await owner.auth.getUser()).data.user).not.toBeNull()
    await owner.from('students').delete().eq('full_name', 'Fee Amount Student')
    studentId = (
      await owner.from('students').insert({ full_name: 'Fee Amount Student', class_name: 'Six' }).select('id').single()
    ).data!.id
  })

  afterAll(async () => {
    // Deleting the student cascades the record; the delete trigger (0097) posts
    // the reversing contra, so the books stay balanced.
    const { data } = await owner.from('students').delete().eq('id', studentId).select('id')
    expect(data).toHaveLength(1)
  })

  it('a record saved without a fee keeps fee_amount NULL (nothing is guessed)', async () => {
    const { data, error } = await owner
      .from('fee_collection_records')
      .insert({ student_id: studentId, month: 3, year: 2099, pay_amount: 900, due_amount: 0 })
      .select('id, fee_amount')
      .single()
    expect(error).toBeNull()
    expect(data!.fee_amount).toBeNull()
    recordId = data!.id
  })

  it('stores the fee, and an advance is then told apart from an exact payment', async () => {
    const { data, error } = await owner
      .from('fee_collection_records')
      .update({ fee_amount: 500 })
      .eq('id', recordId)
      .select('fee_amount, pay_amount, due_amount')
      .single()
    expect(error).toBeNull()
    expect(Number(data!.fee_amount)).toBe(500)
    expect(Number(data!.pay_amount) - Number(data!.fee_amount)).toBe(400)
  })

  it('writing only the fee posts nothing to the ledger', async () => {
    const entries = async () =>
      (await owner.from('gl_entries').select('id').like('ref', `fee:${recordId}:%`)).data ?? []
    const before = (await entries()).length
    await owner.from('fee_collection_records').update({ fee_amount: 600 }).eq('id', recordId)
    expect(await entries()).toHaveLength(before)
  })

  it('rejects a negative fee', async () => {
    const { error } = await owner.from('fee_collection_records').update({ fee_amount: -1 }).eq('id', recordId)
    expect(error?.code).toBe('23514')
  })

  it('the student view still has no fee_amount (ADR 0015)', async () => {
    const { error } = await student.from('student_fee_record').select('fee_amount').limit(1)
    expect(error).not.toBeNull()
  })
})
