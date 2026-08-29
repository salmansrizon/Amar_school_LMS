import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'
import { loadFinancialSummary } from '@/lib/super-admin/financial-report'
import { confirmPayment, createInvoice, recordPayment } from '@/lib/engines/financial/invoicing'

// Financial reporting read-model (master_prd.md doc 005) against live Supabase:
// derived from the GL/invoices, super-admin only, moves with real activity.
describe('Financial summary (#266 reporting)', () => {
  let superClient: SupabaseClient
  let owner: SupabaseClient
  let schoolA: string

  beforeAll(async () => {
    superClient = await signedIn('super@test.local')
    owner = await signedIn('owner-a@test.local')
    const a = (await owner.auth.getUser()).data.user!
    schoolA = (await owner.from('profiles').select('school_id').eq('id', a.id).single()).data!.school_id
  })

  it('reflects a new invoice in outstanding, then collected on payment', async () => {
    const before = await loadFinancialSummary(superClient)
    const id = await createInvoice(superClient, {
      schoolId: schoolA,
      lines: [{ description: 'Report test', unitAmount: 123400 }],
    })
    const afterIssue = await loadFinancialSummary(superClient)
    expect(afterIssue.outstanding - before.outstanding).toBe(123400)
    expect(afterIssue.subscriptionIncome - before.subscriptionIncome).toBe(123400)

    const pay = await recordPayment(superClient, { invoiceId: id, amount: 123400, method: 'cash' })
    await confirmPayment(superClient, pay)
    const afterPay = await loadFinancialSummary(superClient)
    expect(afterPay.outstanding - afterIssue.outstanding).toBe(-123400) // moved out of outstanding
    expect(afterPay.collected - before.collected).toBe(123400) // cash received
    expect(afterPay.paidInvoiceCount).toBeGreaterThan(before.paidInvoiceCount)
  })

  it('is super-admin only', async () => {
    await expect(loadFinancialSummary(owner)).rejects.toThrow()
  })
})
