// Super-admin dashboard KPIs (map #158, ticket #160). Pure aggregation over
// already-fetched school rows so the counts + soon-expiring list are
// unit-testable without a database. The DB stays the authority for status via
// school_subscription_status; this mirrors that rule client-side (as lib/
// subscription.ts already does for the school list) and layers the hard-block
// flag on top.

import { daysUntil, subscriptionStatus, type SubscriptionStatus } from '@/lib/subscription'

/** A school is either hard-blocked (deactivated) or in one of the billing
 *  states. Blocked wins — a deactivated school is blocked regardless of expiry. */
export type LifecycleStatus = SubscriptionStatus | 'blocked'

export interface SchoolRow {
  id: string
  name: string
  subscription_expires_at: string | null
  deactivated_at: string | null
  hasCodeHistory: boolean
}

/** How many days out counts as "soon expiring" for the dashboard highlight. */
export const SOON_EXPIRING_DAYS = 7

export function lifecycleStatus(row: SchoolRow, today: Date): LifecycleStatus {
  if (row.deactivated_at) return 'blocked'
  const expiry = row.subscription_expires_at
    ? new Date(row.subscription_expires_at + 'T00:00:00Z')
    : null
  return subscriptionStatus(row.hasCodeHistory, expiry, today)
}

export interface SoonExpiring {
  id: string
  name: string
  expiry: string
  daysLeft: number
}

export interface SchoolKpis {
  total: number
  trial: number
  active: number
  expired: number
  blocked: number
  soonExpiring: SoonExpiring[]
}

/** Counts by lifecycle status + the soon-expiring list (active/trial schools
 *  whose expiry falls within SOON_EXPIRING_DAYS, today inclusive), sorted
 *  soonest first. Blocked and already-expired schools are not "soon expiring". */
export function summarizeSchools(rows: SchoolRow[], today: Date): SchoolKpis {
  const kpis: SchoolKpis = { total: rows.length, trial: 0, active: 0, expired: 0, blocked: 0, soonExpiring: [] }
  for (const row of rows) {
    const status = lifecycleStatus(row, today)
    kpis[status] += 1
    if ((status === 'active' || status === 'trial') && row.subscription_expires_at) {
      const expiry = new Date(row.subscription_expires_at + 'T00:00:00Z')
      const daysLeft = daysUntil(today, expiry)
      if (daysLeft >= 0 && daysLeft <= SOON_EXPIRING_DAYS) {
        kpis.soonExpiring.push({ id: row.id, name: row.name, expiry: row.subscription_expires_at, daysLeft })
      }
    }
  }
  kpis.soonExpiring.sort((a, b) => a.daysLeft - b.daysLeft || a.name.localeCompare(b.name))
  return kpis
}
