import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'
import { billSubscription, quoteSubscription } from '@/lib/subscription/billing'

// Subscription pricing + billing (map #258, #269) against live Supabase.
//
// Expectations are derived from the live config rather than hardcoded. Both
// subscription_pricing and commission_rules are *config tables* a super admin
// can edit (0091, 0087/0088), so pinning the migration's seed values here made
// the suite fail the moment someone repriced — which is exactly what happened.
// What these tests are actually for is the formula: subtotal = base + per
// student x N, percent discount and commission truncate on integer division.
describe('Subscription billing (#269)', () => {
  let superClient: SupabaseClient
  let owner: SupabaseClient
  let schoolA: string
  let distId: string
  /** subtotal for 100 students at the currently-configured price. */
  let subtotal: number
  /** year-1 subscription commission rate, in basis points. */
  let commissionRate: number

  beforeAll(async () => {
    superClient = await signedIn('super@test.local')
    owner = await signedIn('owner-a@test.local')
    const a = (await owner.auth.getUser()).data.user!
    schoolA = (await owner.from('profiles').select('school_id').eq('id', a.id).single()).data!.school_id
    distId = (await superClient.auth.getUser()).data.user!.id
    await superClient.from('discounts').upsert({ code: 'SUB10', discount_type: 'percent', value: 1000 })

    const pricing = (
      await superClient.from('subscription_pricing').select('base_fee, per_student_fee').eq('singleton', true).single()
    ).data!
    subtotal = Number(pricing.base_fee) + Number(pricing.per_student_fee) * 100
    // Deriving expectations from config buys immunity to repricing, but it
    // would also let a missing or zeroed row make every assertion below
    // vacuously true (0 === 0). docs/008_development_standards.md calls out
    // subscription billing as needing particularly comprehensive testing, so
    // the config itself has to be non-trivial before the maths means anything.
    if (!(subtotal > 0)) {
      throw new Error(`subscription_pricing looks unset: ${JSON.stringify(pricing)}`)
    }

    // Mirrors commission_accrue's tier selection: the highest min_year tier that
    // still covers the year being billed.
    const rules = (
      await superClient
        .from('commission_rules')
        .select('rate, rule_type, min_year, max_year')
        .eq('stream', 'subscription')
        .eq('active', true)
    ).data!
    const rule = rules
      .filter((r) => 1 >= Number(r.min_year) && (r.max_year === null || 1 <= Number(r.max_year)))
      .sort((x, y) => Number(y.min_year) - Number(x.min_year))[0]
    // Thrown, not expect()ed: a failed assertion inside a hook reports as an
    // opaque suite error rather than naming the test that needed it.
    if (rule?.rule_type !== 'percent') {
      throw new Error(`expected a percent year-1 subscription commission rule, got ${JSON.stringify(rule)}`)
    }
    commissionRate = Number(rule.rate)
  })

  afterAll(async () => {
    await superClient.from('discounts').delete().eq('code', 'SUB10')
  })

  it('quotes base + per-student pricing, with and without a coupon', async () => {
    const q = await quoteSubscription(owner, 100)
    expect(q.subtotal).toBe(subtotal) // base + per_student * 100
    expect(q.total).toBe(subtotal)

    // SUB10 is 1000 basis points; the SQL divides bigints, so it truncates.
    const discount = Math.floor((subtotal * 1000) / 10000)
    const qd = await quoteSubscription(owner, 100, 'SUB10')
    expect(qd.discount).toBe(discount)
    expect(qd.total).toBe(subtotal - discount)
  })

  it('issues a subscription invoice into deferred revenue', async () => {
    const inv = await billSubscription(superClient, { schoolId: schoolA, students: 100 })
    const row = (await superClient.from('invoices').select('income_account, total_amount').eq('id', inv).single()).data!
    expect(row.income_account).toBe('4000')
    expect(Number(row.total_amount)).toBe(subtotal)

    const entry = (await superClient.from('gl_entries').select('id').eq('ref', `invoice-defer:${inv}`).single()).data!
    const lines = (await superClient.from('gl_lines').select('account_code, debit, credit').eq('entry_id', entry.id)).data!
    expect(Number(lines.find((line) => line.account_code === '4000')?.debit)).toBe(subtotal)
    expect(Number(lines.find((line) => line.account_code === '2200')?.credit)).toBe(subtotal)

    const period = new Date().toISOString().slice(0, 10)
    const first = await superClient.rpc('vendor_revenue_release', { p_period: period })
    expect(first.error).toBeNull()
    expect(first.data).toBeGreaterThanOrEqual(1)
    const second = await superClient.rpc('vendor_revenue_release', { p_period: period })
    expect(second.error).toBeNull()
    expect(second.data).toBe(0)

    const release = (await superClient.from('gl_entries').select('id').eq('ref', `revenue-release:${inv}:${period.slice(0, 7)}-01`).single()).data!
    const releaseLines = (await superClient.from('gl_lines').select('account_code, debit, credit').eq('entry_id', release.id)).data!
    expect(Number(releaseLines.find((line) => line.account_code === '2200')?.debit)).toBe(subtotal)
    expect(Number(releaseLines.find((line) => line.account_code === '4000')?.credit)).toBe(subtotal)
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
    expect(Number(c.commission_amount)).toBe(Math.floor((subtotal * commissionRate) / 10000))
  })

  it('voids an uncollected subscription with contra entries', async () => {
    const inv = await billSubscription(superClient, { schoolId: schoolA, students: 10 })
    const { error } = await superClient.rpc('vendor_invoice_void', { p_invoice: inv })
    expect(error).toBeNull()

    const status = (await superClient.from('invoices').select('status').eq('id', inv).single()).data!
    expect(status.status).toBe('void')
    const reversals = (await superClient
      .from('gl_entries')
      .select('ref')
      .like('ref', `reversal:%${inv}%`)).data ?? []
    expect(reversals.map((entry) => entry.ref)).toEqual(expect.arrayContaining([
      `reversal:invoice:${inv}`,
      `reversal:invoice-defer:${inv}`,
    ]))

    const release = await superClient.rpc('vendor_revenue_release', { p_period: new Date().toISOString().slice(0, 10) })
    expect(release.error).toBeNull()
    const schedule = (await superClient
      .from('invoice_revenue_schedule')
      .select('voided_at, released_at')
      .eq('invoice_id', inv)
      .single()).data!
    expect(schedule.voided_at).toBeTruthy()
    expect(schedule.released_at).toBeNull()
  })

  it('blocks non-super billing', async () => {
    await expect(billSubscription(owner, { schoolId: schoolA, students: 10 })).rejects.toThrow()
  })
})
