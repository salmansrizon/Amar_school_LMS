import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// Central-GL completion (master_prd.md doc 005): the Accounting-II module
// (vouchers, bank/cash, director capital) now mirrors into the central GL (0098).
describe('Accounting-II → central GL (#271)', () => {
  let owner: SupabaseClient

  const acctOf = async (ref: string, account: string) => {
    const entry = (await owner.from('gl_entries').select('id').eq('ref', ref).maybeSingle()).data
    if (!entry) return null
    const lines = (await owner.from('gl_lines').select('account_code, debit, credit').eq('entry_id', entry.id)).data ?? []
    return lines
      .filter((l) => l.account_code === account)
      .reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0)
  }

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
  })

  afterAll(async () => {
    await owner.from('vouchers').delete().eq('description', 'GL voucher income')
    await owner.from('vouchers').delete().eq('description', 'GL voucher expense')
    await owner.from('voucher_categories').delete().in('name', ['GL Cat Income', 'GL Cat Expense'])
    await owner.from('bank_cash_accounts').delete().eq('name', 'GL Cash Box')
    // director_capital_transactions has no natural cleanup key; left as ledger history.
  })

  it('posts income + expense vouchers to the GL', async () => {
    const inc = (await owner.from('voucher_categories').insert({ name: 'GL Cat Income', type: 'income' }).select('id').single()).data!.id
    const exp = (await owner.from('voucher_categories').insert({ name: 'GL Cat Expense', type: 'expense' }).select('id').single()).data!.id
    const vi = (await owner.from('vouchers').insert({ category_id: inc, description: 'GL voucher income', amount: 100 }).select('id').single()).data!.id
    const ve = (await owner.from('vouchers').insert({ category_id: exp, description: 'GL voucher expense', amount: 50 }).select('id').single()).data!.id

    expect(await acctOf(`voucher:${vi}`, '4500')).toBe(-10000) // Other Income credited 100
    expect(await acctOf(`voucher:${vi}`, '1000')).toBe(10000) // Cash debited
    expect(await acctOf(`voucher:${ve}`, '5100')).toBe(5000) // Operating Expense debited 50
    expect(await acctOf(`voucher:${ve}`, '1000')).toBe(-5000) // Cash credited
  })

  it('posts a bank/cash deposit to the GL', async () => {
    const acc = (await owner.from('bank_cash_accounts').insert({ name: 'GL Cash Box', type: 'cash' }).select('id').single()).data!.id
    const txn = (await owner.from('bank_cash_transactions').insert({ account_id: acc, txn_type: 'deposit', amount: 200 }).select('id').single()).data!.id
    expect(await acctOf(`bankcash:${txn}`, '1000')).toBe(20000) // Cash debited 200
    expect(await acctOf(`bankcash:${txn}`, '3100')).toBe(-20000) // Clearing credited
  })

  it('posts a director capital investment to the GL', async () => {
    const txn = (await owner.from('director_capital_transactions').insert({ txn_type: 'invest', amount: 500, note: 'gl test' }).select('id').single()).data!.id
    expect(await acctOf(`dircap:${txn}`, '1000')).toBe(50000) // Cash debited 500
    expect(await acctOf(`dircap:${txn}`, '3000')).toBe(-50000) // Director Capital credited
  })
})
