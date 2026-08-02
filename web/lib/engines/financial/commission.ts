// Commission accrual + distributor settlement + discount (map #258, #266).
// Thin client over the definer RPCs; accrual credits the commission wallet and
// posts to the GL, settlement pays it out. Amounts in minor units.
import type { SupabaseClient } from '@supabase/supabase-js'

export async function accrueCommission(
  client: SupabaseClient,
  input: { distributorId: string; stream: 'subscription' | 'sms' | 'implementation'; sourceType: string; sourceId: string; baseAmount: number },
  jobSecret?: string,
): Promise<string> {
  const { data, error } = await client.rpc('commission_accrue', {
    p_distributor: input.distributorId,
    p_stream: input.stream,
    p_source_type: input.sourceType,
    p_source_id: input.sourceId,
    p_base_amount: input.baseAmount,
    job_secret: jobSecret ?? null,
  })
  if (error) throw new Error(`commission_accrue failed: ${error.message}`)
  return data as string
}

export async function runSettlement(
  client: SupabaseClient,
  input: { distributorId: string; periodStart: string; periodEnd: string },
  jobSecret?: string,
): Promise<string> {
  const { data, error } = await client.rpc('settlement_run', {
    p_distributor: input.distributorId,
    p_period_start: input.periodStart,
    p_period_end: input.periodEnd,
    job_secret: jobSecret ?? null,
  })
  if (error) throw new Error(`settlement_run failed: ${error.message}`)
  return data as string
}

export async function approveSettlement(
  client: SupabaseClient,
  settlementId: string,
  jobSecret?: string,
): Promise<void> {
  const { error } = await client.rpc('settlement_approve', {
    p_settlement: settlementId,
    job_secret: jobSecret ?? null,
  })
  if (error) throw new Error(`settlement_approve failed: ${error.message}`)
}

/** General discount resolver: computed reduction for a base amount (0 if none). */
export async function resolveDiscount(
  client: SupabaseClient,
  code: string,
  baseAmount: number,
): Promise<number> {
  const { data, error } = await client.rpc('discount_resolve', { p_code: code, p_base_amount: baseAmount })
  if (error) throw new Error(`discount_resolve failed: ${error.message}`)
  return Number(data ?? 0)
}
