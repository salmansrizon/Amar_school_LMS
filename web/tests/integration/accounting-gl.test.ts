import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// Top architectural gap (master_prd.md doc 005): school fee accounting must post
// into the central double-entry GL. This verifies the 0093 trigger does so.
describe('Fee accounting → central GL (#266 integration)', () => {
  let owner: SupabaseClient
  let studentId: string
  let recordId: string

  const feeEntries = async () =>
    (await owner
      .from('gl_entries')
      .select('id, memo')
      .like('ref', `fee:${recordId}:%`)).data ?? []

  const lineSum = async (entryId: string) => {
    const lines = (await owner.from('gl_lines').select('account_code, debit, credit').eq('entry_id', entryId)).data ?? []
    return {
      debit: lines.reduce((s, l) => s + Number(l.debit), 0),
      credit: lines.reduce((s, l) => s + Number(l.credit), 0),
      cash: lines.find((l) => l.account_code === '1000'),
      income: lines.find((l) => l.account_code === '4300'),
    }
  }

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    await owner.from('students').delete().eq('full_name', 'GL Fee Student')
    studentId = (await owner.from('students').insert({ full_name: 'GL Fee Student', class_name: 'Six' }).select('id').single()).data!.id
  })

  afterAll(async () => {
    await owner.from('students').delete().eq('id', studentId)
  })

  it('posts a balanced Cash/Fee-Income entry when a fee is collected', async () => {
    recordId = (await owner
      .from('fee_collection_records')
      .insert({ student_id: studentId, month: 3, year: 2026, pay_amount: 500 })
      .select('id')
      .single()).data!.id

    const entries = await feeEntries()
    expect(entries.length).toBe(1)
    const sums = await lineSum(entries[0].id)
    expect(sums.debit).toBe(sums.credit)
    expect(Number(sums.cash!.debit)).toBe(50000) // 500 taka in poisha, debit Cash
    expect(Number(sums.income!.credit)).toBe(50000) // credit Fee Income
  })

  it('posts the delta on a later payment', async () => {
    await owner.from('fee_collection_records').update({ pay_amount: 800 }).eq('id', recordId)
    const entries = await feeEntries()
    expect(entries.length).toBe(2) // original + delta
    // Newest entry = +300 taka.
    const totalCredit = (
      await Promise.all(entries.map((e) => lineSum(e.id)))
    ).reduce((s, x) => s + x.credit, 0)
    expect(totalCredit).toBe(80000) // 50000 + 30000
  })

  it('reverses on a correction (contra entry)', async () => {
    await owner.from('fee_collection_records').update({ pay_amount: 600 }).eq('id', recordId)
    const entries = await feeEntries()
    expect(entries.length).toBe(3)
    // Net fee income across all entries = 600 taka.
    const net = (await Promise.all(entries.map((e) => lineSum(e.id)))).reduce(
      (s, x) => s + x.credit - x.debit + (x.cash ? 0 : 0),
      0,
    )
    // Net credit to income = net cash debit = 60000 poisha.
    const incomeNet = (
      await Promise.all(
        entries.map(async (e) => {
          const lines = (await owner.from('gl_lines').select('account_code, debit, credit').eq('entry_id', e.id)).data ?? []
          return lines
            .filter((l) => l.account_code === '4300')
            .reduce((s, l) => s + Number(l.credit) - Number(l.debit), 0)
        }),
      )
    ).reduce((s, x) => s + x, 0)
    expect(incomeNet).toBe(60000)
    void net
  })
})

describe('Fee GL — fine, payment method, delete reversal (#271 review)', () => {
  let owner: SupabaseClient
  let studentId: string

  const acctSum = async (recId: string, account: string) => {
    const entries = (await owner.from('gl_entries').select('id').like('ref', `fee:${recId}:%`)).data ?? []
    let net = 0
    for (const e of entries) {
      const lines = (await owner.from('gl_lines').select('account_code, debit, credit').eq('entry_id', e.id)).data ?? []
      net += lines
        .filter((l) => l.account_code === account)
        .reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0)
    }
    return net
  }

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    await owner.from('students').delete().eq('full_name', 'GL Fine Student')
    studentId = (await owner.from('students').insert({ full_name: 'GL Fine Student', class_name: 'Six' }).select('id').single()).data!.id
  })

  afterAll(async () => {
    await owner.from('students').delete().eq('id', studentId)
  })

  it('posts fine income and splits a bank payment to the Bank account', async () => {
    const rec = (await owner
      .from('fee_collection_records')
      .insert({ student_id: studentId, month: 5, year: 2026, pay_amount: 100, fine_amount: 50, payment_method: 'bank' })
      .select('id')
      .single()).data!.id
    expect(await acctSum(rec, '4300')).toBe(-10000) // Fee Income credited 100
    expect(await acctSum(rec, '4400')).toBe(-5000) // Fine Income credited 50
    expect(await acctSum(rec, '1050')).toBe(15000) // Bank debited 150 (not Cash 1000)
    expect(await acctSum(rec, '1000')).toBe(0)
  })

  it('reverses every GL leg when the fee record is deleted', async () => {
    const rec = (await owner
      .from('fee_collection_records')
      .insert({ student_id: studentId, month: 6, year: 2026, pay_amount: 300, fine_amount: 20, payment_method: 'cash' })
      .select('id')
      .single()).data!.id
    expect(await acctSum(rec, '4300')).toBe(-30000)
    await owner.from('fee_collection_records').delete().eq('id', rec)
    // Contra entry nets everything back to zero.
    expect(await acctSum(rec, '4300')).toBe(0)
    expect(await acctSum(rec, '4400')).toBe(0)
    expect(await acctSum(rec, '1000')).toBe(0)
  })
})
