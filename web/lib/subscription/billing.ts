// Configurable subscription pricing + billing (map #258, #269). Thin client over
// the RPCs; billing issues a subscription-income invoice via the Financial
// Engine and accrues distributor commission by renewal year. Amounts in poisha.
import type { SupabaseClient } from '@supabase/supabase-js'

export interface SubscriptionQuote {
  subtotal: number
  discount: number
  total: number
}

/** Preview base + per-student pricing with an optional coupon (any signed-in user). */
export async function quoteSubscription(
  client: SupabaseClient,
  students: number,
  coupon?: string,
): Promise<SubscriptionQuote> {
  const { data, error } = await client.rpc('subscription_quote', { p_students: students, p_coupon: coupon ?? null })
  if (error) throw new Error(`subscription_quote failed: ${error.message}`)
  const row = (data as { subtotal: number; discount: number; total: number }[] | null)?.[0]
  return {
    subtotal: Number(row?.subtotal ?? 0),
    discount: Number(row?.discount ?? 0),
    total: Number(row?.total ?? 0),
  }
}

/** Issue a subscription invoice (super/system); accrues commission when sold via
 * a distributor. Returns the invoice id. */
export async function billSubscription(
  client: SupabaseClient,
  input: { schoolId: string; students: number; year?: number; coupon?: string; distributorId?: string },
  jobSecret?: string,
): Promise<string> {
  const { data, error } = await client.rpc('subscription_bill', {
    p_school: input.schoolId,
    p_students: input.students,
    p_year: input.year ?? 1,
    p_coupon: input.coupon ?? null,
    p_distributor: input.distributorId ?? null,
    job_secret: jobSecret ?? null,
  })
  if (error) throw new Error(`subscription_bill failed: ${error.message}`)
  return data as string
}
