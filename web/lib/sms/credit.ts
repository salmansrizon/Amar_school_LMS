// SMS credit metering (map #171 T6). The DB is the authority for enforcement
// (sms_can_send / sms_record_debit in migration 0074). The pure smsBalance
// mirrors the balance rule so the owner display (T9) and admin ledger (T7) are
// unit-testable without a database. The two RPC wrappers give the send paths one
// shared seam instead of hand-writing the rpc call at each site.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface CreditLedgerRow {
  /** +credits (topup) / -segments (send). */
  delta: number
}

/** Remaining SMS credits = the signed sum of every ledger row. */
export function smsBalance(rows: CreditLedgerRow[]): number {
  return rows.reduce((sum, r) => sum + r.delta, 0)
}

/** Whether the school may send `segs` segments now (true when metering is off for
 *  it). `jobSecret` authorises the service-role cron; school sends pass none. */
export async function smsCanSend(
  supabase: SupabaseClient,
  schoolId: string,
  segs: number,
  jobSecret?: string,
): Promise<boolean> {
  const { data } = await supabase.rpc('sms_can_send', { sid: schoolId, segs, job_secret: jobSecret ?? null })
  return data !== false
}

/** Debit the segments that actually went out (no-op for 0). */
export async function smsRecordDebit(
  supabase: SupabaseClient,
  schoolId: string,
  segs: number,
  jobSecret?: string,
): Promise<void> {
  if (segs > 0) await supabase.rpc('sms_record_debit', { sid: schoolId, segs, job_secret: jobSecret ?? null })
}
