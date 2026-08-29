// SMS credit metering (map #171 T6). The DB is the authority for enforcement
// (sms_can_send / sms_record_debit in migration 0074). The pure smsBalance
// mirrors the balance rule so the owner display (T9) and admin ledger (T7) are
// unit-testable without a database. The two RPC wrappers give the send paths one
// shared seam instead of hand-writing the rpc call at each site.

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface CreditLedgerRow {
  /** +credits (topup) / -segments (send). */
  delta: number
}

/** Remaining SMS credits = the signed sum of every ledger row. */
export function smsBalance(rows: CreditLedgerRow[]): number {
  return rows.reduce((sum, r) => sum + r.delta, 0)
}

/** A near-empty balance nudges the owner to top up before sends bounce. */
export const SMS_LOW_BALANCE = 20

export type BalanceLevel = 'ok' | 'low' | 'empty'

/** Bucket any balance against a low threshold: empty ≤ 0, low ≤ threshold, else
 *  ok. Shared by the per-school credit badge and the master pool (#188). */
export function balanceLevel(balance: number, low: number): BalanceLevel {
  if (balance <= 0) return 'empty'
  if (balance <= low) return 'low'
  return 'ok'
}

/** Bucket a school's SMS balance for owner-side styling (badge / banner). */
export function smsBalanceLevel(balance: number): BalanceLevel {
  return balanceLevel(balance, SMS_LOW_BALANCE)
}

export interface SchoolSmsCredit {
  balance: number
  level: BalanceLevel
}

/** Owner-side SMS credit, or null when prepaid metering is OFF for the school —
 *  the balance UI (map #171 T9) only shows once a school is on prepaid, so
 *  unmetered schools see no badge/banner. cache()-wrapped so the shell layout and
 *  the SMS page share one request (matches getSchoolContext's memoization). */
export const loadSchoolSmsCredit = cache(
  async (supabase: SupabaseClient, schoolId: string): Promise<SchoolSmsCredit | null> => {
    const { data: flag } = await supabase
      .from('school_feature_flags')
      .select('enabled')
      .eq('school_id', schoolId)
      .eq('flag_key', 'sms_metering')
      .maybeSingle()
    if (!flag?.enabled) return null

    const { data: balance } = await supabase.rpc('sms_balance_for', { sid: schoolId })
    const b = (balance as number | null) ?? 0
    return { balance: b, level: smsBalanceLevel(b) }
  },
)

/** One ledger row as the owner's consumption history shows it. */
export interface SmsLedgerEntry {
  delta: number
  reason: 'topup' | 'send' | 'adjust'
  created_at: string
}

/** The school's recent SMS ledger rows (own rows only, via RLS) for the
 *  consumption-history strip on the SMS page. */
export async function loadSchoolSmsLedger(
  supabase: SupabaseClient,
  schoolId: string,
  limit = 6,
): Promise<SmsLedgerEntry[]> {
  const { data } = await supabase
    .from('sms_credit_ledger')
    .select('delta, reason, created_at')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as SmsLedgerEntry[]
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

/** Segments the company still holds at the gateway.
 *
 *  Only needed to explain a refusal: `sms_can_send` returns one boolean for two
 *  different failures (#529), and the school can act on only one of them. Telling
 *  an owner with 8,000 credits that her credit is exhausted sends her to the
 *  wrong place — and to a top-up screen that will not help. */
export async function smsPoolBalance(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase.rpc('sms_pool_balance')
  return typeof data === 'number' ? data : 0
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
