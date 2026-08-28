// The super-admin dashboard read model (map #171, arch-review candidate 1). One
// deep module owns everything between Supabase and the rendered numbers: the
// three queries, the `schools_with_code_history` RPC quirk (setof uuid → bare
// strings), the row-mapping, the single canonical clock, and the sequencing of
// the T2/dashboard aggregation primitives. The pure builder is the test surface
// — the composition that used to hide untested inside the server component is now
// unit-testable; the page just calls loadSuperAdminDashboard and renders.

import type { SupabaseClient } from '@supabase/supabase-js'
import { startOfUtcToday } from '@/lib/subscription'
import { summarizeSchools, dormantCount, type SchoolRow, type SchoolKpis } from '@/lib/super-admin/dashboard'
import {
  incomeSeries,
  smsIncomeSeries,
  latestIncome,
  pendingCollection,
  payableForecast,
  type CodeRow,
  type TopupRow,
  type IncomeBucket,
  type LatestIncome,
  type PendingCollection,
  type PayableForecast,
} from '@/lib/super-admin/financials'
import { smsPoolFrom, type SmsPool } from '@/lib/sms/pool'
import { selectAllRows } from '@/lib/supabase/select-all'

export const DEFAULT_TREND_MONTHS = 12
/** How many recent events the activity feed shows. */
export const ACTIVITY_LIMIT = 8

/** The school columns the dashboard reads (subset of the schools table). */
export interface SchoolFetchRow {
  id: string
  name: string
  subscription_expires_at: string | null
  deactivated_at: string | null
  created_at: string
}

/** One derived entry in the recent-activity feed (map #171 T5). Derive-only:
 *  redemptions (code redeemed_at) and new schools (created_at). SMS top-ups join
 *  once T6 lands sms_credit_ledger. */
export interface ActivityEvent {
  kind: 'redemption' | 'new_school'
  /** ISO timestamp the event happened. */
  at: string
  schoolId: string | null
  schoolName: string
  /** ৳ paid, for redemptions. */
  amount?: number
}

/** Recent events newest-first, capped at `limit`. */
export function buildRecentActivity(
  schools: SchoolFetchRow[],
  codes: CodeRow[],
  limit: number = ACTIVITY_LIMIT,
): ActivityEvent[] {
  const nameById = new Map(schools.map((s) => [s.id, s.name]))
  const events: ActivityEvent[] = []
  for (const c of codes) {
    if (!c.redeemed_at || !c.redeemed_school_id) continue
    events.push({
      kind: 'redemption',
      at: c.redeemed_at,
      schoolId: c.redeemed_school_id,
      schoolName: nameById.get(c.redeemed_school_id) ?? '—',
      amount: c.price,
    })
  }
  for (const s of schools) {
    events.push({ kind: 'new_school', at: s.created_at, schoolId: s.id, schoolName: s.name })
  }
  events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
  return events.slice(0, limit)
}

/** Raw rows the queries return, before any shaping. */
export interface DashboardData {
  schools: SchoolFetchRow[]
  /** `schools_with_code_history` returns setof uuid → bare id strings. */
  history: string[]
  codes: CodeRow[]
  /** sms_credit_ledger top-up rows (amount + created_at) for SMS income. */
  topups: TopupRow[]
  /** Pre-aggregated master SMS pool totals (view `sms_pool_summary`, 0164).
   *  Aggregated in the database rather than folded here: an unbounded fetch is
   *  capped at 1000 rows and a truncated sum cannot tell (#530). */
  pool: { balance: number; bought: number; sent: number }
}

/** The one reference time the whole view uses (status + income share it). */
export interface DashboardClock {
  today: Date
  asOf: Date
}

export interface DashboardViewModel {
  kpis: SchoolKpis
  /** Subscription income (redeemed code prices) this month + % vs last. */
  income: LatestIncome
  incomeSeries: IncomeBucket[]
  /** SMS income (credit top-ups) this month + % vs last — a separate stream. */
  smsIncome: LatestIncome
  pending: PendingCollection
  dormant: number
  /** Renewals-due chase list: soon-expiring schools + their last-paid forecast. */
  payable: PayableForecast
  activity: ActivityEvent[]
  /** Master SMS pool: gateway balance (bought − sent) + level (#188). */
  smsPool: SmsPool
}

/** Pure: shape raw rows into the finished view model. Owns the uuid-string Set
 *  membership, the SchoolRow mapping, and the order the aggregations run in. */
export function buildDashboardViewModel(
  data: DashboardData,
  clock: DashboardClock,
  trendMonths: number = DEFAULT_TREND_MONTHS,
): DashboardViewModel {
  const withHistory = new Set(data.history)
  const rows: SchoolRow[] = data.schools.map((s) => ({
    id: s.id,
    name: s.name,
    subscription_expires_at: s.subscription_expires_at,
    deactivated_at: s.deactivated_at,
    hasCodeHistory: withHistory.has(s.id),
  }))
  const kpis = summarizeSchools(rows, clock.today)
  const series = incomeSeries(data.codes, { asOf: clock.asOf, months: trendMonths })
  const smsSeries = smsIncomeSeries(data.topups, { asOf: clock.asOf, months: trendMonths })
  return {
    kpis,
    income: latestIncome(series),
    incomeSeries: series,
    smsIncome: latestIncome(smsSeries),
    pending: pendingCollection(data.codes),
    dormant: dormantCount(kpis),
    payable: payableForecast(kpis.soonExpiring, data.codes),
    activity: buildRecentActivity(data.schools, data.codes),
    smsPool: smsPoolFrom(data.pool),
  }
}

/** Thin IO wrapper: run the three queries, then hand off to the pure builder with
 *  the canonical clock (UTC-midnight for status, the same instant for income). */
export async function loadSuperAdminDashboard(
  supabase: SupabaseClient,
  trendMonths: number = DEFAULT_TREND_MONTHS,
): Promise<DashboardViewModel> {
  const [{ data: schools }, { data: history }, { data: codes }, { data: topups }, { data: pool }] =
    await Promise.all([
      supabase.from('schools').select('id, name, subscription_expires_at, deactivated_at, created_at').order('name'),
      supabase.rpc('schools_with_code_history'),
      // Paged (#546): these rows are folded into revenue totals and the trend
      // chart, so a short read shows less money than was taken.
      selectAllRows<{ price: number; redeemed_at: string | null; redeemed_school_id: string | null }>(
        (from, to) =>
          supabase.from('subscription_codes').select('price, redeemed_at, redeemed_school_id').range(from, to),
      ).then(({ rows }) => ({ data: rows })),
      supabase.from('sms_credit_ledger').select('amount, created_at').eq('reason', 'topup'),
      supabase.from('sms_pool_summary').select('balance, bought, sent').maybeSingle(),
    ])
  return buildDashboardViewModel(
    {
      schools: (schools ?? []) as SchoolFetchRow[],
      history: (history ?? []) as string[],
      codes: (codes ?? []) as CodeRow[],
      topups: (topups ?? []) as TopupRow[],
      pool: (pool as { balance: number; bought: number; sent: number } | null) ?? { balance: 0, bought: 0, sent: 0 },
    },
    { today: startOfUtcToday(), asOf: new Date() },
    trendMonths,
  )
}
