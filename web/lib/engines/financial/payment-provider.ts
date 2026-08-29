export type PaymentIntentStatus = 'created' | 'pending' | 'succeeded' | 'failed' | 'expired'

export interface PaymentIntentRequest {
  intentId?: string
  invoiceId: string
  amount: number
  currency: 'BDT'
  provider: string
  idempotencyKey: string
  returnUrl: string
}

export interface PaymentIntentResult {
  providerPaymentId: string
  redirectUrl: string
}

export interface PaymentProvider {
  readonly name: string
  createPayment(input: PaymentIntentRequest): Promise<PaymentIntentResult>
  verifyEvent(input: {
    rawBody: string
    headers: Readonly<Record<string, string>>
  }): Promise<VerifiedProviderEvent>
}

export interface VerifiedProviderEvent {
  providerEventId: string
  eventType: string
  intentId: string | null
  providerPaymentId: string | null
  amount: number | null
  status: 'succeeded' | 'failed' | 'pending'
  payload: Record<string, unknown>
  payloadSha256: string
  authentication: Record<string, unknown>
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export class PaymentProviderRegistry {
  private readonly providers = new Map<string, PaymentProvider>()

  register(provider: PaymentProvider): void {
    if (this.providers.has(provider.name)) throw new Error(`payment provider already registered: ${provider.name}`)
    this.providers.set(provider.name, provider)
  }

  get(name: string): PaymentProvider {
    const provider = this.providers.get(name)
    if (!provider) throw new Error(`payment provider not configured: ${name}`)
    return provider
  }
}
