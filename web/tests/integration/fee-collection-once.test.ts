import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// #531 asks for duplicate-payment protection: refresh, back and double-submit
// must not produce a second receipt.
//
// The ticket proposes an idempotency key. This codebase already has one, and it
// is a better one: `one_record_per_student_month` (0016) makes (student, month,
// year) the natural key of a collection. A generated key would deduplicate two
// submits of the SAME form; the natural key also deduplicates two operators
// collecting the same month at two desks, which is the failure a school actually
// has. saveFeeRecord turns the resulting 23505 into the existing record's id and
// sends the operator to the edit flow.
//
// What was untested is the money. The GL trigger (0097) fires on insert and on
// update of pay_amount/fine_amount, and posts a DELTA — so "no second record"
// only means "no second receipt" if the rejected insert also posts nothing.
// That is what this file pins.
describe('one payment, one receipt, one balanced entry (#531)', () => {
  let owner: SupabaseClient
  let studentId: string
  let recordId: string

  const entriesForRecord = async () =>
    (await owner.from('gl_entries').select('id').like('ref', `fee:${recordId}:%`)).data ?? []

  const sums = async () => {
    const ids = (await entriesForRecord()).map((e) => e.id)
    if (!ids.length) return { debit: 0, credit: 0 }
    const lines = (await owner.from('gl_lines').select('debit, credit').in('entry_id', ids)).data ?? []
    return {
      debit: lines.reduce((s, l) => s + Number(l.debit), 0),
      credit: lines.reduce((s, l) => s + Number(l.credit), 0),
    }
  }

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    // The session must be real, or every "sees nothing" assertion below passes
    // for the wrong reason (#542).
    expect((await owner.auth.getUser()).data.user).not.toBeNull()
    await owner.from('students').delete().eq('full_name', 'Once Fee Student')
    studentId = (
      await owner.from('students').insert({ full_name: 'Once Fee Student', class_name: 'Six' }).select('id').single()
    ).data!.id
  })

  afterAll(async () => {
    // Deleting the student cascades the record, and the delete trigger posts the
    // reversing contra — the books stay balanced after teardown too. Asserting
    // the delete landed, because a cleanup that silently does nothing is how
    // fixtures accumulate on the shared project.
    const { data } = await owner.from('students').delete().eq('id', studentId).select('id')
    expect(data).toHaveLength(1)
  })

  it('the first collection writes one record and one balanced entry', async () => {
    recordId = (
      await owner
        .from('fee_collection_records')
        .insert({ student_id: studentId, month: 9, year: 2026, pay_amount: 500, fine_amount: 50, due_amount: 0 })
        .select('id')
        .single()
    ).data!.id

    expect(await entriesForRecord()).toHaveLength(1)
    const { debit, credit } = await sums()
    expect(debit).toBe(credit)
    expect(debit).toBe(55000) // 550 taka in poisha: cash debit against fee + fine income
  })

  it('resubmitting the same collection is rejected and posts nothing', async () => {
    const before = await sums()

    const { error } = await owner
      .from('fee_collection_records')
      .insert({ student_id: studentId, month: 9, year: 2026, pay_amount: 500, fine_amount: 50, due_amount: 0 })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('23505')

    const { data: records } = await owner
      .from('fee_collection_records')
      .select('id')
      .eq('student_id', studentId)
      .eq('month', 9)
      .eq('year', 2026)
    expect(records).toHaveLength(1)
    expect(records![0].id).toBe(recordId)
    expect(await sums()).toEqual(before)
  })

  it('the rejected submit can be recovered as an edit, and the edit posts only the delta', async () => {
    // saveFeeRecord's 23505 branch: find the existing record and edit it.
    const { data: existing } = await owner
      .from('fee_collection_records')
      .select('id')
      .eq('student_id', studentId)
      .eq('month', 9)
      .eq('year', 2026)
      .single()
    expect(existing!.id).toBe(recordId)

    await owner.from('fee_collection_records').update({ pay_amount: 700 }).eq('id', recordId)

    const { debit, credit } = await sums()
    expect(debit).toBe(credit)
    expect(debit).toBe(75000) // 550 + the 200 taka delta, never 550 + 750
  })
})
