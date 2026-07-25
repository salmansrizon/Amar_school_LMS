// The super-admin dashboard read model (map #171, arch-review candidate 1). One
// deep module owns everything between Supabase and the rendered numbers: the
// three queries, the `schools_with_code_history` RPC quirk (setof uuid → bare
// strings), the row-mapping, the single canonical clock, and the sequencing of
// the T2/dashboard aggregation primitives. The pure builder is the test surface
// — the composition that used to hide untested inside the server component is now
// unit-testable; the page just calls loadSuperAdminDashboard and renders.

import type { SupabaseClient } from '@supabase/supabase-js'
import { startOfUtcToday } from '@/lib/subscription'
import { summarizeSchools, type SchoolRow, type SchoolKpis } from '@/lib/super-admin/dashboard'
import {
  incomeSeries,
  latestIncome,
  pendingCollection,
  dormantCount,
  type CodeRow,
  type IncomeBucket,
  type LatestIncome,
  type PendingCollection,
} from '@/lib/super-admin/financials'

export const DEFAULT_TREND_MONTHS = 12

/** The school columns the dashboard reads (subset of the schools table). */
export interface SchoolFetchRow {
  id: string
  name: string
  subscription_expires_at: string | null
  deactivated_at: string | null
}

/** Raw rows the three queries return, before any shaping. */
export interface DashboardData {
  schools: SchoolFetchRow[]
  /** `schools_with_code_history` returns setof uuid → bare id strings. */
  history: string[]
  codes: CodeRow[]
}

/** The one reference time the whole view uses (status + income share it). */
export interface DashboardClock {
  today: Date
  asOf: Date
}

export interface DashboardViewModel {
  kpis: SchoolKpis
  income: LatestIncome
  incomeSeries: IncomeBucket[]
  pending: PendingCollection
  dormant: number
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
  return {
    kpis,
    income: latestIncome(series),
    incomeSeries: series,
    pending: pendingCollection(data.codes),
    dormant: dormantCount(kpis),
  }
}

/** Thin IO wrapper: run the three queries, then hand off to the pure builder with
 *  the canonical clock (UTC-midnight for status, the same instant for income). */
export async function loadSuperAdminDashboard(
  supabase: SupabaseClient,
  trendMonths: number = DEFAULT_TREND_MONTHS,
): Promise<DashboardViewModel> {
  const [{ data: schools }, { data: history }, { data: codes }] = await Promise.all([
    supabase.from('schools').select('id, name, subscription_expires_at, deactivated_at').order('name'),
    supabase.rpc('schools_with_code_history'),
    supabase.from('subscription_codes').select('price, redeemed_at, redeemed_school_id'),
  ])
  return buildDashboardViewModel(
    {
      schools: (schools ?? []) as SchoolFetchRow[],
      history: (history ?? []) as string[],
      codes: (codes ?? []) as CodeRow[],
    },
    { today: startOfUtcToday(), asOf: new Date() },
    trendMonths,
  )
}
