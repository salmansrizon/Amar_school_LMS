// Financial reporting read-model (master_prd.md doc 005). Reads the GL/invoice-
// derived platform summary. All amounts are poisha (integer minor units).
import type { SupabaseClient } from '@supabase/supabase-js'

// Re-exported from the shared money module so existing importers keep working
// while distributor/school surfaces import formatTaka from '@/lib/money' directly.
export { formatTaka } from '@/lib/money'

export interface FinancialSummary {
  grossRevenue: number
  totalExpense: number
  net: number
  collected: number
  outstanding: number
  commissionPayable: number
  subscriptionIncome: number
  smsIncome: number
  feeIncome: number
  paidInvoiceCount: number
}

/** Load the super-admin financial summary from the ledger. */
export async function loadFinancialSummary(client: SupabaseClient): Promise<FinancialSummary> {
  const { data, error } = await client.rpc('financial_summary')
  if (error) throw new Error(`financial_summary failed: ${error.message}`)
  const d = (data ?? {}) as Record<string, number>
  return {
    grossRevenue: Number(d.gross_revenue ?? 0),
    totalExpense: Number(d.total_expense ?? 0),
    net: Number(d.net ?? 0),
    collected: Number(d.collected ?? 0),
    outstanding: Number(d.outstanding ?? 0),
    commissionPayable: Number(d.commission_payable ?? 0),
    subscriptionIncome: Number(d.subscription_income ?? 0),
    smsIncome: Number(d.sms_income ?? 0),
    feeIncome: Number(d.fee_income ?? 0),
    paidInvoiceCount: Number(d.paid_invoice_count ?? 0),
  }
}
