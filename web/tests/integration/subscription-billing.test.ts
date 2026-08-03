import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'
import { billSubscription, quoteSubscription } from '@/lib/subscription/billing'

// Subscription pricing + billing (map #258, #269) against live Supabase.
describe('Subscription billing (#269)', () => {
  let superClient: SupabaseClient
  let owner: SupabaseClient
  let schoolA: string
  let distId: string

  beforeAll(async () => {
    superClient = await signedIn('super@test.local')
    owner = await signedIn('owner-a@test.local')
    const a = (await owner.auth.getUser()).data.user!
    schoolA = (await owner.from('profiles').select('school_id').eq('id', a.id).single()).data!.school_id
    distId = (await superClient.auth.getUser()).data.user!.id
    await superClient.from('discounts').upsert({ code: 'SUB10', discount_type: 'percent', value: 1000 })
  })

  afterAll(async () => {
    await superClient.from('discounts').delete().eq('code', 'SUB10')
  })

  it('quotes base + per-student pricing, with and without a coupon', async () => {
    const q = await quoteSubscription(owner, 100)
    expect(q.subtotal).toBe(270000) // 200000 base + 700*100
    expect(q.total).toBe(270000)

    const qd = await quoteSubscription(owner, 100, 'SUB10')
    expect(qd.discount).toBe(27000) // 10%
    expect(qd.total).toBe(243000)
  })

  it('bills a subscription invoice on subscription income', async () => {
    const inv = await billSubscription(superClient, { schoolId: schoolA, students: 100 })
    const row = (await superClient.from('invoices').select('income_account, total_amount').eq('id', inv).single()).data!
    expect(row.income_account).toBe('4000')
    expect(Number(row.total_amount)).toBe(270000)
  })

  it('accrues distributor commission by renewal year', async () => {
    const inv = await billSubscription(superClient, {
      schoolId: schoolA, students: 100, year: 1, distributorId: distId,
    })
    const c = (await superClient
      .from('commissions')
      .select('commission_amount')
      .eq('source_type', 'subscription_invoice')
      .eq('source_id', inv)
      .single()).data!
    expect(Number(c.commission_amount)).toBe(81000) // 30% of 270000 (year 1)
  })

  it('blocks non-super billing', async () => {
    await expect(billSubscription(owner, { schoolId: schoolA, students: 10 })).rejects.toThrow()
  })
})
