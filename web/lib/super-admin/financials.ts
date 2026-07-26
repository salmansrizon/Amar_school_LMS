// Super-admin financial aggregation (map #171, T2). Pure functions over rows the
// page already fetched — subscription_codes and the soon-expiring list — so every
// number on the dashboard is unit-testable without a database, the same rule
// lib/super-admin/dashboard.ts follows. All amounts are plain numbers (BDT ৳);
// formatting is the UI's concern.
//
// Income is recognised at REDEMPTION (grill decision, map #171): a code counts
// only once its `redeemed_at` lands, in that calendar month. A created-but-
// unredeemed code is "pending collection", never income.

import type { SoonExpiring, SchoolKpis } from '@/lib/super-admin/dashboard'

/** The slice of a subscription_codes row these aggregations need. */
export interface CodeRow {
  price: number
  redeemed_at: string | null
  redeemed_school_id: string | null
}

/** `count` ascending 'YYYY-MM' keys ending at (and including) asOf's month. */
export function monthKeysEndingAt(asOf: Date, count: number): string[] {
  const keys: string[] = []
  const year = asOf.getUTCFullYear()
  const month = asOf.getUTCMonth() // 0-based
  for (let back = count - 1; back >= 0; back--) {
    const d = new Date(Date.UTC(year, month - back, 1))
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return keys
}

export interface IncomeBucket {
  month: string
  total: number
}

/** One dated ৳ amount to bucket — `at` is an ISO timestamp, a null `amount` is
 *  skipped (an unredeemed code / a non-topup ledger row). */
interface DatedAmount {
  at: string
  amount: number | null
}

/** Monthly ৳ totals for the last `months` months ending at asOf, ascending and
 *  zero-filled so a trend chart has a bar for every month. The one bucketing rule
 *  behind both income streams (subscriptions and SMS top-ups). */
function bucketByMonth(entries: DatedAmount[], opts: { asOf: Date; months: number }): IncomeBucket[] {
  const keys = monthKeysEndingAt(opts.asOf, opts.months)
  const totals = new Map<string, number>(keys.map((k) => [k, 0]))
  for (const e of entries) {
    if (e.amount == null) continue
    const key = e.at.slice(0, 7)
    if (totals.has(key)) totals.set(key, totals.get(key)! + e.amount)
  }
  return keys.map((month) => ({ month, total: totals.get(month)! }))
}

/** Subscription income per month: redeemed-code prices bucketed by redemption. */
export function incomeSeries(codes: CodeRow[], opts: { asOf: Date; months: number }): IncomeBucket[] {
  return bucketByMonth(
    codes.map((c) => ({ at: c.redeemed_at ?? '', amount: c.redeemed_at ? c.price : null })),
    opts,
  )
}

/** Signed, rounded percent change from `previous` to `current`; null when there
 *  is no baseline (previous is 0), since a percentage off zero is undefined. */
export function deltaPercent(current: number, previous: number): number | null {
  if (previous === 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

export interface LatestIncome {
  total: number
  /** Percent vs the previous month; null with no baseline / < 2 months. */
  delta: number | null
}

/** The headline "this-month income + % vs last" the KPI card shows, read off the
 *  tail of an income series. Empty series → 0 / null. */
export function latestIncome(series: IncomeBucket[]): LatestIncome {
  if (series.length === 0) return { total: 0, delta: null }
  const total = series[series.length - 1].total
  if (series.length < 2) return { total, delta: null }
  return { total, delta: deltaPercent(total, series[series.length - 2].total) }
}

/** Dormant = every school that is not currently active: expired subscriptions
 *  plus paused ones (map #171: pause is the deactivated_at flag, counted as
 *  `blocked` in the KPI breakdown). Reads the counts dashboard.ts already made. */
export function dormantCount(kpis: SchoolKpis): number {
  return kpis.expired + kpis.blocked
}

/** A subscription-code redemption or an SMS-credit top-up — a dated ৳ amount.
 *  incomeSeries buckets subscription redemptions; smsIncomeSeries buckets these. */
export interface TopupRow {
  amount: number | null
  created_at: string
}

/** SMS income per month = ৳ from credit top-ups bucketed by created_at — a stream
 *  separate from subscriptions. */
export function smsIncomeSeries(topups: TopupRow[], opts: { asOf: Date; months: number }): IncomeBucket[] {
  return bucketByMonth(
    topups.map((t) => ({ at: t.created_at, amount: t.amount })),
    opts,
  )
}

export interface PendingCollection {
  count: number
  total: number
}

/** Codes created but not yet redeemed — owner paid, hasn't activated. */
export function pendingCollection(codes: CodeRow[]): PendingCollection {
  let count = 0
  let total = 0
  for (const c of codes) {
    if (c.redeemed_at) continue
    count += 1
    total += c.price
  }
  return { count, total }
}

export interface SchoolLedgerEntry {
  schoolId: string
  monthsPaid: number
  totalPaid: number
}

/** Per-school payment history: months paid = redeemed code count, total = sum of
 *  their prices. Only redeemed codes contribute; unredeemed ones are ignored. */
export function perSchoolLedger(codes: CodeRow[]): SchoolLedgerEntry[] {
  const bySchool = new Map<string, SchoolLedgerEntry>()
  for (const c of codes) {
    if (!c.redeemed_at || !c.redeemed_school_id) continue
    const entry = bySchool.get(c.redeemed_school_id) ?? {
      schoolId: c.redeemed_school_id,
      monthsPaid: 0,
      totalPaid: 0,
    }
    entry.monthsPaid += 1
    entry.totalPaid += c.price
    bySchool.set(c.redeemed_school_id, entry)
  }
  return [...bySchool.values()]
}

/** Every school's last-paid price in one pass — schoolId → price of its most
 *  recently redeemed code. The map form is for callers that need it per school
 *  across a whole list (e.g. the schools manager), avoiding a rescan each row. */
export function lastPaidBySchool(codes: CodeRow[]): Map<string, number> {
  const latestAt = new Map<string, string>()
  const price = new Map<string, number>()
  for (const c of codes) {
    if (!c.redeemed_school_id || !c.redeemed_at) continue
    const prev = latestAt.get(c.redeemed_school_id)
    if (prev === undefined || c.redeemed_at > prev) {
      latestAt.set(c.redeemed_school_id, c.redeemed_at)
      price.set(c.redeemed_school_id, c.price)
    }
  }
  return price
}

/** Price of a school's most recently redeemed code, or null when it never paid —
 *  the best estimate for what its renewal will cost (payable forecast). */
export function lastPaidPrice(codes: CodeRow[], schoolId: string): number | null {
  let latest: string | null = null
  let price: number | null = null
  for (const c of codes) {
    if (c.redeemed_school_id !== schoolId || !c.redeemed_at) continue
    if (latest === null || c.redeemed_at > latest) {
      latest = c.redeemed_at
      price = c.price
    }
  }
  return price
}

export interface PayableRow extends SoonExpiring {
  /** Forecast renewal amount (last-paid price), or null when never paid. */
  lastPaid: number | null
}

export interface PayableForecast {
  rows: PayableRow[]
  total: number
}

/** Expected renewal revenue from the soon-expiring schools: each row carries its
 *  last-paid price as the forecast; the total sums only the known (non-null)
 *  ones. Order follows the soon-expiring list (soonest first). */
export function payableForecast(soonExpiring: SoonExpiring[], codes: CodeRow[]): PayableForecast {
  let total = 0
  const rows = soonExpiring.map((s) => {
    const lastPaid = lastPaidPrice(codes, s.id)
    if (lastPaid !== null) total += lastPaid
    return { ...s, lastPaid }
  })
  return { rows, total }
}
