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

export type PoolLevel = BalanceLevel

export function poolLevel(balance: number): PoolLevel {
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

/** Shape the pool ledger rows into the admin view model — pure, so it is
 *  unit-testable and the dashboard read model can own the fetch (rows are modest:
 *  one per purchase, one per send, so summing is fine). */
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
