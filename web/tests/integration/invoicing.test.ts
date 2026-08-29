import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'
import { confirmPayment, createInvoice, recordPayment } from '@/lib/engines/financial/invoicing'

// Invoicing + manual payments (map #258, #266) against live Supabase: issue +
// GL posting, tax, pay flow with InvoicePaid, partial payment, authority, RLS.
describe('Invoicing & payments (#266)', () => {
  let superClient: SupabaseClient
  let owner: SupabaseClient
  let ownerB: SupabaseClient
  let schoolA: string

  beforeAll(async () => {
    superClient = await signedIn('super@test.local')
    owner = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    const a = (await owner.auth.getUser()).data.user!
    schoolA = (await owner.from('profiles').select('school_id').eq('id', a.id).single()).data!.school_id
  })

  it('issues an invoice, posts a balanced GL entry, and scopes reads', async () => {
    const id = await createInvoice(superClient, {
      schoolId: schoolA,
      lines: [{ description: 'Subscription Aug', unitAmount: 200000 }],
      taxAmount: 30000,
      memo: 'monthly',
    })
    const inv = (await superClient.from('invoices').select('total_amount, status').eq('id', id).single()).data!
    expect(inv.total_amount).toBe(230000)
    expect(inv.status).toBe('issued')

    // GL entry balances (AR 230000 = income 200000 + tax 30000).
    const entry = (await superClient.from('gl_entries').select('id').eq('ref', `invoice:${id}`).single()).data!
    const lines = (await superClient.from('gl_lines').select('debit, credit').eq('entry_id', entry.id)).data ?? []
    const debit = lines.reduce((s, l) => s + Number(l.debit), 0)
    const credit = lines.reduce((s, l) => s + Number(l.credit), 0)
    expect(debit).toBe(230000)
    expect(credit).toBe(230000)

    expect((await owner.from('invoices').select('id').eq('id', id)).data).toHaveLength(1)
    expect((await ownerB.from('invoices').select('id').eq('id', id)).data).toHaveLength(0)
  })

  it('records + confirms a payment and marks the invoice paid', async () => {
    const id = await createInvoice(superClient, {
      schoolId: schoolA,
      lines: [{ description: 'Subscription', unitAmount: 200000 }],
    })
    // School records its own payment (pending).
    const payId = await recordPayment(owner, { invoiceId: id, amount: 200000, method: 'bkash', reference: 'TX1' })
    const status = await confirmPayment(superClient, payId)
    expect(status).toBe('paid')

    const paidEvent = (await superClient
      .from('domain_events')
      .select('id')
      .eq('type', 'InvoicePaid')
      .filter('payload->>invoiceId', 'eq', id)).data ?? []
    expect(paidEvent.length).toBeGreaterThanOrEqual(1)
  })

  it('stays unpaid until fully covered (partial payments)', async () => {
    const id = await createInvoice(superClient, {
      schoolId: schoolA,
      lines: [{ description: 'Subscription', unitAmount: 200000 }],
    })
    const p1 = await recordPayment(superClient, { invoiceId: id, amount: 100000, method: 'cash' })
    expect(await confirmPayment(superClient, p1)).not.toBe('paid')
    const p2 = await recordPayment(superClient, { invoiceId: id, amount: 100000, method: 'cash' })
    expect(await confirmPayment(superClient, p2)).toBe('paid')
  })

  it('enforces authority', async () => {
    // Non-super cannot issue.
    await expect(
      createInvoice(owner, { schoolId: schoolA, lines: [{ description: 'x', unitAmount: 100 }] }),
    ).rejects.toThrow()

    const id = await createInvoice(superClient, {
      schoolId: schoolA,
      lines: [{ description: 'y', unitAmount: 100 }],
    })
    // Other tenant cannot record a payment on it.
    await expect(recordPayment(ownerB, { invoiceId: id, amount: 100, method: 'cash' })).rejects.toThrow()
    // Non-super cannot confirm.
    const payId = await recordPayment(owner, { invoiceId: id, amount: 100, method: 'cash' })
    await expect(confirmPayment(owner, payId)).rejects.toThrow()
  })
})
