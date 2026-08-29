// Super-admin master SMS pool (map #171, #188) — the vendor's SMS balance at the
// gateway. Gateway-balance model: buy (+) tops it up, every school send (−) draws
// it down; the pool = SMS still available at the gateway (bought − sent). Display
// only — allocation to schools does not touch it (that grants per-school credits;
// the pool mirrors real consumption so the admin sees the total drop and re-buys).
// Pure balance helpers so the admin display is unit-testable without a database.

import { balanceLevel, type BalanceLevel } from '@/lib/sms/credit'

export interface PoolLedgerRow {
  /** +bought (buy) / −sent (send) / ±correction (adjust). */
  delta: number
}

/** Unallocated SMS = signed sum of every pool ledger row. */
export function poolBalance(rows: PoolLedgerRow[]): number {
  return rows.reduce((sum, r) => sum + r.delta, 0)
}

/** Below this, nudge the admin to re-buy from the gateway. */
export const SMS_POOL_LOW = 500

/** `impossible` is not a worse `empty` — it is a different kind of fact.
 *
 *  A pool of 0 is a business state the Super Admin fixes by buying more. A pool
 *  below 0 says segments left the gateway that were never bought, which means the
 *  ledger and reality disagree and no amount of buying explains it. The UAT pass
 *  found -981 rendered as an ordinary KPI beside the words "pool is empty" (#529);
 *  a number that cannot happen must read as a fault, not as a metric. */
export type PoolLevel = BalanceLevel | 'impossible'

export function poolLevel(balance: number): PoolLevel {
  if (balance < 0) return 'impossible'
  return balanceLevel(balance, SMS_POOL_LOW)
}

export interface SmsPool {
  balance: number
  level: PoolLevel
  /** Total ever bought (Σ positive deltas) — the "SMS brought" figure. */
  bought: number
  /** Total ever sent/consumed (Σ negative deltas, as a positive number). */
  sent: number
}

/** Attach the level to totals the database already aggregated (view
 *  `sms_pool_summary`, 0164). */
export function smsPoolFrom(totals: { balance: number; bought: number; sent: number }): SmsPool {
  return { ...totals, level: poolLevel(totals.balance) }
}

/** Shape raw pool ledger rows into the admin view model.
 *
 *  Retained for callers that genuinely hold every row — the pure fold is still
 *  the rule in one place. It is NOT how the dashboard reads the pool: "one per
 *  purchase, one per send, so summing is fine" was true at 297 rows and is the
 *  same reasoning that produced #530's phantom ৳2,800 at 46,521. An unbounded
 *  fetch is capped at 1000 and the fold cannot tell. See `sms_pool_summary`. */
export function summarizeSmsPool(rows: PoolLedgerRow[]): SmsPool {
  const balance = poolBalance(rows)
  let bought = 0
  let sent = 0
  for (const r of rows) {
    if (r.delta > 0) bought += r.delta
    else sent += -r.delta
  }
  return { balance, level: poolLevel(balance), bought, sent }
}
