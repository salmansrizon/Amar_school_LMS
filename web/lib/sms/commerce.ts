// SMS Commerce (map #258, #268). Package catalog + purchase flow on the wallet
// primitive (#265) and Financial Engine (#266): buying a package issues an SMS-
// income invoice, allocates the segments to the school's SMS wallet, and accrues
// distributor commission on the sale. Route pricing lives in sms_rate_config.
import type { SupabaseClient } from '@supabase/supabase-js'

export interface SmsPackage {
  id: string
  name: Record<string, string>
  segments: number
  price: number // poisha
}

export async function listSmsPackages(client: SupabaseClient): Promise<SmsPackage[]> {
  const { data } = await client
    .from('sms_packages')
    .select('id, name, segments, price')
    .eq('active', true)
    .order('segments')
  return ((data ?? []) as { id: string; name: Record<string, string>; segments: number; price: number }[]).map((p) => ({
    id: p.id,
    name: p.name,
    segments: p.segments,
    price: Number(p.price),
  }))
}

/** Purchase an SMS package for a school (super/system): issue an SMS-income
 * invoice, allocate the segments to the school SMS wallet, and — when sold via a
 * distributor — accrue their commission. Returns the invoice id. */
export async function purchaseSmsPackage(
  client: SupabaseClient,
  input: { schoolId: string; packageId: string; idempotencyKey: string; distributorId?: string },
  jobSecret?: string,
): Promise<string> {
  const { data: invoiceId, error } = await client.rpc('sms_package_purchase', {
    p_school_id: input.schoolId,
    p_package_id: input.packageId,
    p_idempotency_key: input.idempotencyKey,
    p_distributor_id: input.distributorId ?? null,
    job_secret: jobSecret ?? null,
  })
  if (error) throw new Error(`sms_package_purchase failed: ${error.message}`)
  return invoiceId as string
}
