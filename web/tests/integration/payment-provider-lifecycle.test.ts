import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'
import { createInvoice, PaymentLifecycle } from '@/lib/engines/financial/invoicing'
import { PaymentProviderRegistry, type PaymentProvider } from '@/lib/engines/financial/payment-provider'

describe('payment provider lifecycle', () => {
  let superClient: SupabaseClient
  let owner: SupabaseClient
  let schoolId: string
  let provider: PaymentProvider
  let lastPayment: { intentId: string; providerPaymentId: string; amount: number } | undefined

  beforeAll(async () => {
    superClient = await signedIn('super@test.local')
    owner = await signedIn('owner-a@test.local')
    const user = (await owner.auth.getUser()).data.user!
    schoolId = (await owner.from('profiles').select('school_id').eq('id', user.id).single()).data!.school_id
    provider = {
      name: 'fake-lifecycle',
      async createPayment(input) {
        lastPayment = { intentId: input.intentId!, providerPaymentId: `fake-${input.intentId}`, amount: input.amount }
        return { providerPaymentId: lastPayment.providerPaymentId, redirectUrl: 'https://example.invalid/fake' }
      },
      async verifyEvent() {
        if (!lastPayment) throw new Error('payment was not created')
        return {
          providerEventId: `event-${lastPayment.providerPaymentId}`,
          eventType: 'payment.succeeded',
          intentId: lastPayment.intentId,
          providerPaymentId: lastPayment.providerPaymentId,
          amount: lastPayment.amount,
          status: 'succeeded' as const,
          payload: { redacted: true },
          payloadSha256: 'hash-1',
        }
      },
    }
  })

  it('is idempotent and confirms verified events through the existing GL path', async () => {
    const invoiceId = await createInvoice(superClient, {
      schoolId,
      lines: [{ description: 'Provider lifecycle', unitAmount: 12345 }],
    })
    const registry = new PaymentProviderRegistry()
    registry.register(provider)
    const lifecycle = new PaymentLifecycle(superClient, registry)
    const first = await lifecycle.create({
      invoiceId,
      provider: provider.name,
      idempotencyKey: `lifecycle-${invoiceId}`,
      currency: 'BDT',
      returnUrl: 'https://example.invalid/return',
    })
    expect(first.redirectUrl).toContain('example.invalid')
    expect((await lifecycle.create({
      invoiceId,
      provider: provider.name,
      idempotencyKey: `lifecycle-${invoiceId}`,
      currency: 'BDT',
      returnUrl: 'https://example.invalid/return',
    })).intentId).toBe(first.intentId)

    await lifecycle.handleEvent(provider.name, { rawBody: '{}', headers: {} })
    await lifecycle.handleEvent(provider.name, { rawBody: '{}', headers: {} })

    const intent = (await superClient.from('payment_intents').select('status, provider_payment_id').eq('id', first.intentId).single()).data!
    expect(intent.status).toBe('succeeded')
    expect(intent.provider_payment_id).toBe(`fake-${first.intentId}`)
    expect((await superClient.from('payment_provider_events').select('processed_at').eq('intent_id', first.intentId)).data).toHaveLength(1)
    expect((await superClient.from('payments').select('status').eq('reference', `fake-${first.intentId}`).single()).data!.status).toBe('confirmed')
  })
})
