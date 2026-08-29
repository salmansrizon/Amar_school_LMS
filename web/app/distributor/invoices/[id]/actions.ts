'use server'

import { revalidatePath } from 'next/cache'
import { getDistributorContext } from '@/lib/distributor/context'
import { takaToPoisha } from '@/lib/money'
import { pgErrorMessage } from '@/lib/crud/pg-error'

// Distributor records a (pending) payment on its own invoice (#319). Super-admin
// confirms it (payment_confirm stays vendor-side for money safety). payment_record
// authorizes the invoice's distributor via RLS/RPC.
export async function recordPayment(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getDistributorContext()
  const invoiceId = String(formData.get('invoice_id') ?? '')
  const method = String(formData.get('method') ?? '').trim() || 'bank'
  const reference = String(formData.get('reference') ?? '').trim() || null
  const amount = takaToPoisha(String(formData.get('amount') ?? ''))
  if (!invoiceId) return { error: 'Missing invoice.' }
  if (amount === null) return { error: 'Amount must be positive.' }

  const { error } = await supabase.rpc('payment_record', {
    p_invoice_id: invoiceId,
    p_amount: amount,
    p_method: method,
    p_reference: reference,
  })
  if (error) return { error: pgErrorMessage(error) }
  revalidatePath(`/distributor/invoices/${invoiceId}`)
  return {}
}
