import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// written for migration 0258 — NOT RUN (the migration is not applied, and the
// integration suite writes to the shared database).
// Seam: the ledger posting of a Fee Collection Record (#707). The received
// amount includes the fine: cash moves by pay_amount only.

describe('fee ledger: the fine is inside the received amount (#707, 0258)', () => {
  let owner: SupabaseClient
  let studentId: string
  let recordId: string

  /** Net per account in poisha: cash as a debit balance, income as a credit balance. */
  const held = async (id: string) => {
    const entries = (await owner.from('gl_entries').select('id').like('ref', `fee:${id}:%`)).data ?? []
    const lines = entries.length
      ? ((
          await owner
            .from('gl_lines')
            .select('account_code, debit, credit')
            .in(
              'entry_id',
              entries.map((e) => e.id),
            )
        ).data ?? [])
      : []
    const net = (code: string, sign: 1 | -1) =>
      lines.filter((l) => l.account_code === code).reduce((s, l) => s + sign * (Number(l.debit) - Number(l.credit)), 0)
    return { cash: net('1000', 1), fee: net('4300', -1), fine: net('4400', -1) }
  }

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    expect((await owner.auth.getUser()).data.user).not.toBeNull()
    await owner.from('students').delete().eq('full_name', 'Fine Inside Student')
    studentId = (
      await owner.from('students').insert({ full_name: 'Fine Inside Student', class_name: 'Six' }).select('id').single()
    ).data!.id
  })

  afterAll(async () => {
    const { data } = await owner.from('students').delete().eq('id', studentId).select('id')
    expect(data).toHaveLength(1)
  })

  it('fee 100, fine 10, received 60: cash 60 = fine 10 + fee 50', async () => {
    const { data, error } = await owner
      .from('fee_collection_records')
      .insert({ student_id: studentId, month: 6, year: 2099, fee_amount: 100, pay_amount: 60, fine_amount: 10, due_amount: 50 })
      .select('id')
      .single()
    expect(error).toBeNull()
    recordId = data!.id
    expect(await held(recordId)).toEqual({ cash: 6000, fee: 5000, fine: 1000 })
  })

  it('edited to received 130: cash 130 in all', async () => {
    const { error } = await owner.from('fee_collection_records').update({ pay_amount: 130, due_amount: 0 }).eq('id', recordId)
    expect(error).toBeNull()
    expect(await held(recordId)).toEqual({ cash: 13000, fee: 12000, fine: 1000 })
  })

  it('a fine-only edit is accepted and moves no cash', async () => {
    const { error } = await owner.from('fee_collection_records').update({ fine_amount: 25 }).eq('id', recordId)
    expect(error).toBeNull()
    expect(await held(recordId)).toEqual({ cash: 13000, fee: 10500, fine: 2500 })
  })

  it('the Student view reports the advance and still has no adjustment', async () => {
    const student = await signedIn('s9001@test-a.students.invalid')
    const { error } = await student.from('student_fee_record').select('id, advance_amount').limit(1)
    expect(error).toBeNull()
    expect((await student.from('student_fee_record').select('adjust_amount').limit(1)).error).not.toBeNull()
    expect((await student.from('student_fee_record').select('fee_amount').limit(1)).error).not.toBeNull()
  })

  it('a void nets every account of the record to zero', async () => {
    const { error } = await owner
      .from('fee_collection_records')
      .update({ void_at: new Date().toISOString(), void_reason: '0258 test' })
      .eq('id', recordId)
    expect(error).toBeNull()
    expect(await held(recordId)).toEqual({ cash: 0, fee: 0, fine: 0 })
  })

  it('a deleted record nets to zero too', async () => {
    const id = (
      await owner
        .from('fee_collection_records')
        .insert({ student_id: studentId, month: 7, year: 2099, pay_amount: 110, fine_amount: 10, due_amount: 0 })
        .select('id')
        .single()
    ).data!.id
    expect(await held(id)).toEqual({ cash: 11000, fee: 10000, fine: 1000 })
    expect((await owner.from('fee_collection_records').delete().eq('id', id)).error).toBeNull()
    expect(await held(id)).toEqual({ cash: 0, fee: 0, fine: 0 })
  })
})
