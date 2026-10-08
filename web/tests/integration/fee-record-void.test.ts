import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// written for migration 0231 — NOT RUN (the migration is not applied, and the
// integration suite writes to the shared database).
// Seam: voiding a Fee Collection Record (#683): who / when / why on the row, a
// reversing ledger entry, nothing deleted, no amount changed.

describe('void a fee record (#683, 0231)', () => {
  let owner: SupabaseClient
  let staff: SupabaseClient
  let studentId: string
  let recordId: string

  const glSums = async (id: string) => {
    const entries = (await owner.from('gl_entries').select('id').like('ref', `fee:${id}:%`)).data ?? []
    if (!entries.length) return { entries: 0, cashNet: 0 }
    const lines =
      (
        await owner
          .from('gl_lines')
          .select('account_code, debit, credit')
          .in(
            'entry_id',
            entries.map((e) => e.id),
          )
      ).data ?? []
    const cash = lines.filter((l) => l.account_code === '1000')
    return {
      entries: entries.length,
      cashNet: cash.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0),
    }
  }

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    staff = await signedIn('staff-e2e@test.local')
    expect((await owner.auth.getUser()).data.user).not.toBeNull()
    await owner.from('students').delete().eq('full_name', 'Void Fee Student')
    studentId = (
      await owner.from('students').insert({ full_name: 'Void Fee Student', class_name: 'Six' }).select('id').single()
    ).data!.id
    recordId = (
      await owner
        .from('fee_collection_records')
        .insert({ student_id: studentId, month: 4, year: 2099, pay_amount: 500, fine_amount: 50, due_amount: 0 })
        .select('id')
        .single()
    ).data!.id
  })

  afterAll(async () => {
    // The cascade deletes the voided row too; fee_post_gl_delete skips it, so
    // the void's reversal is not posted a second time.
    const { data } = await owner.from('students').delete().eq('id', studentId).select('id')
    expect(data).toHaveLength(1)
  })

  it('a record cannot be created already voided', async () => {
    const { error } = await owner.from('fee_collection_records').insert({
      student_id: studentId,
      month: 5,
      year: 2099,
      pay_amount: 100,
      void_at: new Date().toISOString(),
      void_reason: 'x',
    })
    expect(error).not.toBeNull()
  })

  it('a void needs a reason', async () => {
    const { error } = await owner
      .from('fee_collection_records')
      .update({ void_at: new Date().toISOString() })
      .eq('id', recordId)
    expect(error?.message).toMatch(/reason/i)
  })

  it('a void cannot change an amount in the same statement', async () => {
    const { error } = await owner
      .from('fee_collection_records')
      .update({ void_at: new Date().toISOString(), void_reason: 'wrong student', pay_amount: 0 })
      .eq('id', recordId)
    expect(error?.message).toMatch(/cannot change any other field/i)
  })

  it('a Staff User cannot void, even with the fees screen', async () => {
    const { error, data } = await staff
      .from('fee_collection_records')
      .update({ void_at: new Date().toISOString(), void_reason: 'staff try' })
      .eq('id', recordId)
      .select('id')
    // Either refused by the trigger (grant held) or no row visible (no grant).
    expect(Boolean(error) || !data?.length).toBe(true)
    const { data: row } = await owner.from('fee_collection_records').select('void_at').eq('id', recordId).single()
    expect(row!.void_at).toBeNull()
  })

  it('the owner voids: who/when/why are stamped, amounts and updated_at stay, the ledger nets to zero', async () => {
    const before = (
      await owner
        .from('fee_collection_records')
        .select('pay_amount, fine_amount, adjust_amount, due_amount, updated_at')
        .eq('id', recordId)
        .single()
    ).data!
    const beforeGl = await glSums(recordId)
    expect(beforeGl.cashNet).toBe(55000)

    const backdated = '2001-01-01T00:00:00.000Z'
    const { error } = await owner
      .from('fee_collection_records')
      .update({ void_at: backdated, void_reason: '  wrong student  ' })
      .eq('id', recordId)
    expect(error).toBeNull()

    const after = (
      await owner
        .from('fee_collection_records')
        .select('pay_amount, fine_amount, adjust_amount, due_amount, updated_at, void_at, void_by, void_reason')
        .eq('id', recordId)
        .single()
    ).data!
    expect(after.void_reason).toBe('wrong student')
    expect(after.void_by).toBe((await owner.auth.getUser()).data.user!.id)
    // The database chose the time, not the request.
    expect(new Date(after.void_at).getFullYear()).toBeGreaterThan(2001)
    expect({
      pay_amount: after.pay_amount,
      fine_amount: after.fine_amount,
      adjust_amount: after.adjust_amount,
      due_amount: after.due_amount,
      updated_at: after.updated_at,
    }).toEqual(before)

    const afterGl = await glSums(recordId)
    expect(afterGl.entries).toBe(beforeGl.entries + 1)
    expect(afterGl.cashNet).toBe(0)
  })

  it('a voided record cannot be edited or un-voided', async () => {
    const edit = await owner.from('fee_collection_records').update({ pay_amount: 1 }).eq('id', recordId)
    expect(edit.error?.message).toMatch(/voided fee record cannot be changed/i)
    const unvoid = await owner
      .from('fee_collection_records')
      .update({ void_at: null, void_reason: null, void_by: null })
      .eq('id', recordId)
    expect(unvoid.error?.message).toMatch(/voided fee record cannot be changed/i)
  })

  it('the month can be collected again, but only once', async () => {
    const key = { student_id: studentId, month: 4, year: 2099 }
    const again = await owner.from('fee_collection_records').insert({ ...key, pay_amount: 300 }).select('id').single()
    expect(again.error).toBeNull()
    const third = await owner.from('fee_collection_records').insert({ ...key, pay_amount: 300 })
    expect(third.error?.code).toBe('23505')
    const { data } = await owner.from('fee_collection_records').select('id, void_at').match(key)
    expect(data).toHaveLength(2)
    expect(data!.filter((r) => r.void_at === null)).toHaveLength(1)
  })

  it('the student view has no void columns', async () => {
    const student = await signedIn('s9001@test-a.students.invalid')
    const { error } = await student.from('student_fee_record').select('void_at').limit(1)
    expect(error).not.toBeNull()
  })
})
