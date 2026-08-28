import { describe, it, expect } from 'vitest'
import {
  buildDashboardViewModel,
  type DashboardData,
} from '@/lib/super-admin/dashboard-read-model'

// The composition that used to hide, untested, inside the server component: the
// uuid-string history join, the SchoolRow mapping, the shared clock, and the
// order the aggregations run in. buildDashboardViewModel is the test surface.

const CLOCK = { today: new Date('2026-07-15T00:00:00Z'), asOf: new Date('2026-07-15T10:00:00Z') }

const data: DashboardData = {
  schools: [
    // active: has code history + future expiry (soon-expiring for payable)
    { id: 'a', name: 'Alpha', subscription_expires_at: '2026-07-18', deactivated_at: null, created_at: '2026-01-01T00:00:00Z' },
    // expired: has history but lapsed
    { id: 'b', name: 'Beta', subscription_expires_at: '2026-06-01', deactivated_at: null, created_at: '2026-02-01T00:00:00Z' },
    // paused/blocked: deactivated wins over a healthy expiry
    { id: 'c', name: 'Gamma', subscription_expires_at: '2027-01-01', deactivated_at: '2026-07-01T00:00:00Z', created_at: '2026-03-01T00:00:00Z' },
    // trial: no code history, no expiry
    { id: 'd', name: 'Delta', subscription_expires_at: null, deactivated_at: null, created_at: '2026-07-10T00:00:00Z' },
  ],
  history: ['a', 'b', 'c'], // bare uuid strings from the RPC
  codes: [
    { price: 5000, redeemed_at: '2026-07-03T00:00:00Z', redeemed_school_id: 'a' },
    { price: 4000, redeemed_at: '2026-06-10T00:00:00Z', redeemed_school_id: 'b' },
    { price: 9999, redeemed_at: null, redeemed_school_id: null }, // pending
  ],
  topups: [
    { amount: 2000, created_at: '2026-07-05T00:00:00Z' },
    { amount: 1000, created_at: '2026-06-05T00:00:00Z' },
  ],
  // 0164: the pool arrives pre-aggregated from sms_pool_summary rather than as
  // ledger rows the app folds — an unbounded fetch is capped at 1000 (#530).
  pool: { balance: 8500, bought: 10000, sent: 1500 },
}

describe('buildDashboardViewModel', () => {
  const vm = buildDashboardViewModel(data, CLOCK, 3)

  it('joins code history by bare uuid and classifies each school', () => {
    expect(vm.kpis.active).toBe(1) // Alpha
    expect(vm.kpis.expired).toBe(1) // Beta
    expect(vm.kpis.blocked).toBe(1) // Gamma (deactivated)
    expect(vm.kpis.trial).toBe(1) // Delta
    expect(vm.kpis.total).toBe(4)
  })

  it('buckets income at redemption over the trend window, using asOf', () => {
    expect(vm.incomeSeries).toEqual([
      { month: '2026-05', total: 0 },
      { month: '2026-06', total: 4000 },
      { month: '2026-07', total: 5000 },
    ])
    expect(vm.income).toEqual({ total: 5000, delta: 25 })
  })

  it('tracks SMS income (top-ups) as a separate stream from subscriptions', () => {
    // trend window includes 2026-06 (1000) and 2026-07 (2000)
    expect(vm.smsIncome).toEqual({ total: 2000, delta: 100 })
  })

  it('carries the master SMS pool totals through and levels them', () => {
    expect(vm.smsPool.bought).toBe(10000)
    expect(vm.smsPool.sent).toBe(1500)
    expect(vm.smsPool.balance).toBe(8500)
    expect(vm.smsPool.level).toBe('ok')
  })

  it('sums pending collection and dormant = expired + paused', () => {
    expect(vm.pending).toEqual({ count: 1, total: 9999 })
    expect(vm.dormant).toBe(2) // Beta (expired) + Gamma (paused)
  })

  it('forecasts payable from soon-expiring schools (last-paid)', () => {
    // Alpha expires 2026-07-18 (3 days out) → the only renewal due
    expect(vm.payable.rows.map((r) => r.id)).toEqual(['a'])
    expect(vm.payable.rows[0].lastPaid).toBe(5000)
    expect(vm.payable.total).toBe(5000)
  })

  it('builds a newest-first activity feed from redemptions + new schools', () => {
    expect(vm.activity[0]).toMatchObject({ kind: 'new_school', schoolId: 'd', at: '2026-07-10T00:00:00Z' })
    expect(vm.activity[1]).toMatchObject({ kind: 'redemption', schoolId: 'a', amount: 5000 })
    // 2 redemptions + 4 new-school events, all under the cap
    expect(vm.activity).toHaveLength(6)
  })
})
