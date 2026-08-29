import { describe, expect, it } from 'vitest'
import { PaymentProviderRegistry, sha256Hex, type PaymentProvider } from '@/lib/engines/financial/payment-provider'

const fake: PaymentProvider = {
  name: 'fake',
  async createPayment() {
    return { providerPaymentId: 'fake-1', redirectUrl: 'https://example.invalid/pay/fake-1' }
  },
  async verifyEvent() {
    return {
      providerEventId: 'event-1',
      eventType: 'payment.succeeded',
      intentId: 'intent-1',
      providerPaymentId: 'fake-1',
      amount: 100,
      status: 'succeeded' as const,
      payload: {},
      payloadSha256: await sha256Hex('{}'),
    }
  },
}

describe('payment provider registry', () => {
  it('resolves registered providers and rejects missing or duplicate providers', () => {
    const registry = new PaymentProviderRegistry()
    registry.register(fake)
    expect(registry.get('fake')).toBe(fake)
    expect(() => registry.get('sslcommerz')).toThrow('not configured')
    expect(() => registry.register(fake)).toThrow('already registered')
  })
})
