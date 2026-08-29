// Invoicing + manual payments (map #258, #266). Thin client over the definer
// RPCs; issuing and confirming both post into the GL (0085) and emit
// InvoiceGenerated / InvoicePaid. Amounts are integer minor units (poisha).
import type { SupabaseClient } from '@supabase/supabase-js'
import { PaymentProviderRegistry, sha256Hex, type PaymentIntentRequest, type VerifiedProviderEvent } from './payment-provider'

export interface InvoiceLineInput {
  description: string
  quantity?: number
  unitAmount: number
}

export interface CreateInvoiceInput {
  schoolId: string
  lines: InvoiceLineInput[]
  taxAmount?: number
  incomeAccount?: string
  dueAt?: string | null
  memo?: string
}

/** Issue an invoice (super-admin or system); posts AR/income to the GL. */
export async function createInvoice(
  client: SupabaseClient,
  input: CreateInvoiceInput,
  jobSecret?: string,
): Promise<string> {
  const { data, error } = await client.rpc('invoice_create', {
    p_school_id: input.schoolId,
    p_lines: input.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity ?? 1,
      unit_amount: l.unitAmount,
    })),
    p_tax_amount: input.taxAmount ?? 0,
    p_income_account: input.incomeAccount ?? '4000',
    p_due_at: input.dueAt ?? null,
    p_memo: input.memo ?? '',
    job_secret: jobSecret ?? null,
  })
  if (error) throw new Error(`invoice_create failed: ${error.message}`)
  return data as string
}

/** Record a (manual) payment against an invoice — super/system or the invoice's
 * own school member. Starts pending. */
export async function recordPayment(
  client: SupabaseClient,
  input: { invoiceId: string; amount: number; method: string; reference?: string },
  jobSecret?: string,
): Promise<string> {
  const { data, error } = await client.rpc('payment_record', {
    p_invoice_id: input.invoiceId,
    p_amount: input.amount,
    p_method: input.method,
    p_reference: input.reference ?? null,
    job_secret: jobSecret ?? null,
  })
  if (error) throw new Error(`payment_record failed: ${error.message}`)
  return data as string
}

/** Confirm a payment (super/system): posts the cash receipt, marks the invoice
 * paid when fully covered. Returns the resulting invoice status. */
export async function confirmPayment(
  client: SupabaseClient,
  paymentId: string,
  jobSecret?: string,
): Promise<string> {
  const { data, error } = await client.rpc('payment_confirm', {
    p_payment_id: paymentId,
    job_secret: jobSecret ?? null,
  })
  if (error) throw new Error(`payment_confirm failed: ${error.message}`)
  return data as string
}

export class PaymentLifecycle {
  constructor(
    private readonly client: SupabaseClient,
    private readonly providers: PaymentProviderRegistry,
    private readonly jobSecret?: string,
  ) {}

  async create(
    input: Omit<PaymentIntentRequest, 'amount'> & { amount?: number },
  ): Promise<{ intentId: string; redirectUrl: string }> {
    const provider = this.providers.get(input.provider)
    const { data: intentId, error } = await this.client.rpc('payment_intent_create', {
      p_invoice_id: input.invoiceId,
      p_provider: input.provider,
      p_amount: input.amount ?? null,
      p_idempotency_key: input.idempotencyKey,
      job_secret: this.jobSecret ?? null,
    })
    if (error) throw new Error(`payment_intent_create failed: ${error.message}`)

    const { data: intent, error: readError } = await this.client
      .from('payment_intents')
      .select('id, invoice_id, amount, currency, status, redirect_url')
      .eq('id', intentId)
      .single()
    if (readError) throw new Error(`payment intent read failed: ${readError.message}`)

    if (intent.status !== 'created') {
      if (intent.redirect_url) return { intentId: intent.id, redirectUrl: intent.redirect_url }
      throw new Error(`payment intent is not startable (status=${intent.status})`)
    }

    const result = await provider.createPayment({
      ...input,
      intentId: intent.id,
      invoiceId: intent.invoice_id,
      amount: Number(intent.amount),
      currency: intent.currency,
    })
    const { error: startError } = await this.client.rpc('payment_intent_start', {
      p_intent_id: intent.id,
      p_provider_payment_id: result.providerPaymentId,
      p_redirect_url: result.redirectUrl,
      job_secret: this.jobSecret ?? null,
    })
    if (startError) throw new Error(`payment_intent_start failed: ${startError.message}`)
    return { intentId: intent.id, redirectUrl: result.redirectUrl }
  }

  async handleEvent(
    providerName: string,
    input: { rawBody: string; headers: Readonly<Record<string, string>> },
  ): Promise<void> {
    const event: VerifiedProviderEvent = await this.providers.get(providerName).verifyEvent(input)
    if (event.payloadSha256 !== await sha256Hex(input.rawBody)) throw new Error('provider event payload hash mismatch')
    const { data: eventId, error } = await this.client.rpc('payment_provider_event_record', {
      p_intent_id: event.intentId,
      p_provider: providerName,
      p_provider_event_id: event.providerEventId,
      p_event_type: event.eventType,
      p_payload: event.payload,
      p_payload_sha256: event.payloadSha256,
      job_secret: this.jobSecret ?? null,
    })
    if (error) throw new Error(`payment_provider_event_record failed: ${error.message}`)

    if (event.status === 'succeeded') {
      if (!event.intentId || !event.providerPaymentId || event.amount === null) {
        throw new Error('successful provider event is missing payment identity or amount')
      }
      const { error: succeedError } = await this.client.rpc('payment_intent_succeed', {
        p_intent_id: event.intentId,
        p_provider_payment_id: event.providerPaymentId,
        p_amount: event.amount,
        job_secret: this.jobSecret ?? null,
      })
      if (succeedError) throw new Error(`payment_intent_succeed failed: ${succeedError.message}`)
    } else if (event.intentId) {
      const { error: statusError } = await this.client.rpc('payment_intent_transition', {
        p_intent_id: event.intentId,
        p_status: event.status,
        job_secret: this.jobSecret ?? null,
      })
      if (statusError) throw new Error(`payment_intent_transition failed: ${statusError.message}`)
    }

    const { error: processedError } = await this.client.rpc('payment_provider_event_mark_processed', {
      p_event_id: eventId,
      job_secret: this.jobSecret ?? null,
    })
    if (processedError) throw new Error(`payment_provider_event_mark_processed failed: ${processedError.message}`)
  }
}
