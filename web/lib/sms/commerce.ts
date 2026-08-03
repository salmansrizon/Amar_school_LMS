// SMS Commerce (map #258, #268). Package catalog + purchase flow on the wallet
// primitive (#265) and Financial Engine (#266): buying a package issues an SMS-
// income invoice, allocates the segments to the school's SMS wallet, and accrues
// distributor commission on the sale. Route pricing lives in sms_rate_config.
import type { SupabaseClient } from '@supabase/supabase-js'
import { createInvoice } from '@/lib/engines/financial/invoicing'
import { accrueCommission } from '@/lib/engines/financial/commission'

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
  input: { schoolId: string; packageId: string; distributorId?: string },
  jobSecret?: string,
): Promise<string> {
  const { data: pkg, error } = await client
    .from('sms_packages')
    .select('id, name, segments, price')
    .eq('id', input.packageId)
    .single()
  if (error || !pkg) throw new Error('unknown SMS package')

  const invoiceId = await createInvoice(
    client,
    {
      schoolId: input.schoolId,
      incomeAccount: '4100', // SMS income
      lines: [{ description: `SMS package: ${(pkg.name as Record<string, string>).en ?? 'SMS'}`, unitAmount: Number(pkg.price) }],
      memo: 'SMS package purchase',
    },
    jobSecret,
  )

  const { error: topErr } = await client.rpc('sms_topup', {
    sid: input.schoolId,
    segs: pkg.segments,
    amount_taka: Number(pkg.price) / 100,
    note: 'package purchase',
    job_secret: jobSecret ?? null,
  })
  if (topErr) throw new Error(`sms allocation failed: ${topErr.message}`)

  if (input.distributorId) {
    await accrueCommission(
      client,
      { distributorId: input.distributorId, stream: 'sms', sourceType: 'sms_package', sourceId: invoiceId, baseAmount: Number(pkg.price) },
      jobSecret,
    )
  }
  return invoiceId
}
