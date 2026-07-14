import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Seam: Accounting II (issue #35, PRD §5.6) — voucher categories/vouchers,
// asset categories/assets, bank/cash accounts + transactions, and director
// capital transactions. The real money-safety guards (insufficient-balance
// rejection) live in the database (0055's apply_bank_cash_transaction /
// apply_director_capital_transaction triggers) — these tests exercise that
// DB-level enforcement directly, the same way fee-collection.test.ts
// exercises the one-record-per-student-per-month unique constraint.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const PASSWORD = 'test-password-123!'

async function signedIn(email: string): Promise<SupabaseClient> {
  const client = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`login failed for ${email}: ${error.message}`)
  return client
}

describe('Accounting II: voucher categories + vouchers (issue #35)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let categoryId: string
  let foreignCategoryId: string

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')

    await ownerA.from('voucher_categories').delete().eq('name', 'AII Test Income Category')
    await ownerB.from('voucher_categories').delete().eq('name', 'AII Test Foreign Category')

    categoryId = (
      await ownerA
        .from('voucher_categories')
        .insert({ name: 'AII Test Income Category', type: 'income' })
        .select('id')
        .single()
    ).data!.id
    foreignCategoryId = (
      await ownerB
        .from('voucher_categories')
        .insert({ name: 'AII Test Foreign Category', type: 'expense' })
        .select('id')
        .single()
    ).data!.id
  })

  afterAll(async () => {
    await ownerA.from('vouchers').delete().eq('category_id', categoryId)
    await ownerA.from('voucher_categories').delete().eq('id', categoryId)
    await ownerB.from('voucher_categories').delete().eq('id', foreignCategoryId)
  })

  it('a voucher is auto-numbered VCH-{year}-{seq} and scoped to the owner school', async () => {
    const { data, error } = await ownerA
      .from('vouchers')
      .insert({ category_id: categoryId, txn_date: '2026-07-03', description: 'AII Test voucher 1', amount: 1500 })
      .select('id, voucher_no, school_id')
      .single()
    expect(error).toBeNull()
    expect(data!.school_id).not.toBeNull()
    expect(data!.voucher_no).toMatch(/^VCH-2026-\d{4}$/)
  })

  it('a second voucher the same year gets the next sequence number', async () => {
    const { data: first } = await ownerA
      .from('vouchers')
      .insert({ category_id: categoryId, txn_date: '2026-07-04', description: 'AII Test voucher 2', amount: 200 })
      .select('voucher_no')
      .single()
    const seq = Number(first!.voucher_no.split('-')[2])
    const { data: second, error } = await ownerA
      .from('vouchers')
      .insert({ category_id: categoryId, txn_date: '2026-07-05', description: 'AII Test voucher 3', amount: 300 })
      .select('voucher_no')
      .single()
    expect(error).toBeNull()
    expect(Number(second!.voucher_no.split('-')[2])).toBe(seq + 1)
  })

  it("rejects a category_id belonging to another school (tenancy trigger)", async () => {
    const { error } = await ownerA
      .from('vouchers')
      .insert({ category_id: foreignCategoryId, description: 'AII Test bad voucher', amount: 100 })
    expect(error).not.toBeNull()
  })

  it('rejects a non-positive amount', async () => {
    const { error } = await ownerA
      .from('vouchers')
      .insert({ category_id: categoryId, description: 'AII Test zero amount', amount: 0 })
    expect(error).not.toBeNull()
  })

  it('rejects an oversized image attachment (DB-level cap, not just the UI)', async () => {
    const { error } = await ownerA.from('vouchers').insert({
      category_id: categoryId,
      description: 'AII Test oversized image',
      amount: 100,
      attachment_path: 'x/y/z.jpg',
      attachment_mime: 'image/jpeg',
      attachment_size: 600000, // > 500KB cap
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/500KB/i)
  })

  it('accepts a PDF attachment up to 5MB', async () => {
    const { error } = await ownerA.from('vouchers').insert({
      category_id: categoryId,
      description: 'AII Test pdf attachment',
      amount: 100,
      attachment_path: 'x/y/z.pdf',
      attachment_mime: 'application/pdf',
      attachment_size: 5 * 1024 * 1024,
    })
    expect(error).toBeNull()
  })

  it("another School's owner sees none of these vouchers", async () => {
    const { data } = await ownerB.from('vouchers').select('id').eq('category_id', categoryId)
    expect(data).toEqual([])
  })
})

describe('Accounting II: asset categories + assets (issue #35)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let categoryId: string
  let foreignCategoryId: string

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')

    await ownerA.from('asset_categories').delete().eq('name', 'AII Test Asset Category')
    await ownerB.from('asset_categories').delete().eq('name', 'AII Test Foreign Asset Category')

    categoryId = (
      await ownerA
        .from('asset_categories')
        .insert({ name: 'AII Test Asset Category' })
        .select('id')
        .single()
    ).data!.id
    foreignCategoryId = (
      await ownerB
        .from('asset_categories')
        .insert({ name: 'AII Test Foreign Asset Category' })
        .select('id')
        .single()
    ).data!.id
  })

  afterAll(async () => {
    await ownerA.from('assets').delete().eq('category_id', categoryId)
    await ownerA.from('asset_categories').delete().eq('id', categoryId)
    await ownerB.from('asset_categories').delete().eq('id', foreignCategoryId)
  })

  it('an asset is created scoped to the owner school', async () => {
    const { data, error } = await ownerA
      .from('assets')
      .insert({
        category_id: categoryId,
        name: 'AII Test Projector',
        purchase_date: '2024-01-12',
        purchase_value: 45000,
        depreciation_rate_percent: 15,
      })
      .select('id, school_id')
      .single()
    expect(error).toBeNull()
    expect(data!.school_id).not.toBeNull()
  })

  it("rejects a category_id belonging to another school (tenancy trigger)", async () => {
    const { error } = await ownerA
      .from('assets')
      .insert({ category_id: foreignCategoryId, name: 'AII Test bad asset', purchase_value: 100 })
    expect(error).not.toBeNull()
  })

  it('rejects a depreciation rate above 100%', async () => {
    const { error } = await ownerA
      .from('assets')
      .insert({ category_id: categoryId, name: 'AII Test bad rate', depreciation_rate_percent: 150 })
    expect(error).not.toBeNull()
  })

  it("another School's owner sees none of these assets", async () => {
    const { data } = await ownerB.from('assets').select('id').eq('category_id', categoryId)
    expect(data).toEqual([])
  })
})

describe('Accounting II: bank/cash accounts + transactions (issue #35)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let accountId: string
  let foreignAccountId: string

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')

    await ownerA.from('bank_cash_accounts').delete().eq('name', 'AII Test Cash Fund')
    await ownerB.from('bank_cash_accounts').delete().eq('name', 'AII Test Foreign Account')

    accountId = (
      await ownerA
        .from('bank_cash_accounts')
        .insert({ name: 'AII Test Cash Fund', type: 'cash', balance: 1000 })
        .select('id')
        .single()
    ).data!.id
    foreignAccountId = (
      await ownerB
        .from('bank_cash_accounts')
        .insert({ name: 'AII Test Foreign Account', type: 'cash', balance: 500 })
        .select('id')
        .single()
    ).data!.id
  })

  afterAll(async () => {
    await ownerA.from('bank_cash_transactions').delete().eq('account_id', accountId)
    await ownerA.from('bank_cash_accounts').delete().eq('id', accountId)
    await ownerB.from('bank_cash_accounts').delete().eq('id', foreignAccountId)
  })

  it('a deposit increases the account balance and stamps balance_after', async () => {
    const { data, error } = await ownerA
      .from('bank_cash_transactions')
      .insert({ account_id: accountId, txn_type: 'deposit', amount: 500 })
      .select('balance_after')
      .single()
    expect(error).toBeNull()
    expect(Number(data!.balance_after)).toBe(1500)

    const { data: acc } = await ownerA.from('bank_cash_accounts').select('balance').eq('id', accountId).single()
    expect(Number(acc!.balance)).toBe(1500)
  })

  it('a withdraw within balance succeeds and decreases the balance', async () => {
    const { data, error } = await ownerA
      .from('bank_cash_transactions')
      .insert({ account_id: accountId, txn_type: 'withdraw', amount: 300 })
      .select('balance_after')
      .single()
    expect(error).toBeNull()
    expect(Number(data!.balance_after)).toBe(1200)
  })

  it('a withdraw exceeding the balance is rejected by the DB (real guard, not just UI)', async () => {
    const { error } = await ownerA
      .from('bank_cash_transactions')
      .insert({ account_id: accountId, txn_type: 'withdraw', amount: 999999 })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/insufficient balance/i)

    // Balance is unchanged after the rejected withdrawal.
    const { data: acc } = await ownerA.from('bank_cash_accounts').select('balance').eq('id', accountId).single()
    expect(Number(acc!.balance)).toBe(1200)
  })

  it('a cheque withdrawal on a bank account records cheque_no/cheque_date', async () => {
    const { data: bankAcc } = await ownerA
      .from('bank_cash_accounts')
      .insert({ name: 'AII Test Bank Account', type: 'bank', balance: 5000 })
      .select('id')
      .single()
    const { data, error } = await ownerA
      .from('bank_cash_transactions')
      .insert({
        account_id: bankAcc!.id,
        txn_type: 'withdraw',
        amount: 1000,
        payment_method: 'cheque',
        cheque_no: 'CHQ-001',
        cheque_date: '2026-07-10',
      })
      .select('cheque_no, cheque_date')
      .single()
    expect(error).toBeNull()
    expect(data!.cheque_no).toBe('CHQ-001')
    await ownerA.from('bank_cash_transactions').delete().eq('account_id', bankAcc!.id)
    await ownerA.from('bank_cash_accounts').delete().eq('id', bankAcc!.id)
  })

  it('rejects cheque_no set without payment_method=cheque', async () => {
    const { error } = await ownerA
      .from('bank_cash_transactions')
      .insert({ account_id: accountId, txn_type: 'deposit', amount: 10, cheque_no: 'CHQ-999' })
    expect(error).not.toBeNull()
  })

  it("rejects an account_id belonging to another school (tenancy check in the trigger)", async () => {
    const { error } = await ownerA
      .from('bank_cash_transactions')
      .insert({ account_id: foreignAccountId, txn_type: 'deposit', amount: 10 })
    expect(error).not.toBeNull()
  })

  it("another School's owner sees none of this account's transactions", async () => {
    const { data } = await ownerB.from('bank_cash_transactions').select('id').eq('account_id', accountId)
    expect(data).toEqual([])
  })
})

describe('Accounting II: director capital (issue #35)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    // Clean slate: withdraw everything down to (as close to) zero isn't
    // practical, so instead we just track the delta each assertion expects
    // relative to whatever balance already exists for this test school.
  })

  it('invest increases the running balance and withdraw decreases it', async () => {
    const { data: before } = await ownerA.from('director_capital_balances').select('balance').maybeSingle()
    const startBalance = Number(before?.balance ?? 0)

    const { data: invested, error: investErr } = await ownerA
      .from('director_capital_transactions')
      .insert({ txn_type: 'invest', amount: 10000, note: 'AII Test invest' })
      .select('balance_after')
      .single()
    expect(investErr).toBeNull()
    expect(Number(invested!.balance_after)).toBe(startBalance + 10000)

    const { data: withdrawn, error: withdrawErr } = await ownerA
      .from('director_capital_transactions')
      .insert({ txn_type: 'withdraw', amount: 4000, note: 'AII Test withdraw' })
      .select('balance_after')
      .single()
    expect(withdrawErr).toBeNull()
    expect(Number(withdrawn!.balance_after)).toBe(startBalance + 6000)

    await ownerA.from('director_capital_transactions').delete().eq('note', 'AII Test invest')
    await ownerA.from('director_capital_transactions').delete().eq('note', 'AII Test withdraw')
  })

  it('a withdrawal exceeding the running balance is rejected by the DB', async () => {
    const { error } = await ownerA
      .from('director_capital_transactions')
      .insert({ txn_type: 'withdraw', amount: 99999999, note: 'AII Test overdraw' })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/insufficient balance/i)
  })

  it("another School's owner has an independent director capital balance", async () => {
    const { data: aBalance } = await ownerA.from('director_capital_balances').select('school_id').maybeSingle()
    const { data: bRows } = await ownerB
      .from('director_capital_balances')
      .select('school_id')
      .eq('school_id', aBalance?.school_id ?? '00000000-0000-0000-0000-000000000000')
    expect(bRows).toEqual([])
  })
})
