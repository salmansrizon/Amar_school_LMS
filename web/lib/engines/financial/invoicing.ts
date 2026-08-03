// Invoicing + manual payments (map #258, #266). Thin client over the definer
// RPCs; issuing and confirming both post into the GL (0085) and emit
// InvoiceGenerated / InvoicePaid. Amounts are integer minor units (poisha).
import type { SupabaseClient } from '@supabase/supabase-js'

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
