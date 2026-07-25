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
    // active: has code history + future expiry
    { id: 'a', name: 'Alpha', subscription_expires_at: '2026-09-01', deactivated_at: null },
    // expired: has history but lapsed
    { id: 'b', name: 'Beta', subscription_expires_at: '2026-06-01', deactivated_at: null },
    // paused/blocked: deactivated wins over a healthy expiry
    { id: 'c', name: 'Gamma', subscription_expires_at: '2027-01-01', deactivated_at: '2026-07-01T00:00:00Z' },
    // trial: no code history, no expiry
    { id: 'd', name: 'Delta', subscription_expires_at: null, deactivated_at: null },
  ],
  history: ['a', 'b', 'c'], // bare uuid strings from the RPC
  codes: [
    { price: 5000, redeemed_at: '2026-07-03T00:00:00Z', redeemed_school_id: 'a' },
    { price: 4000, redeemed_at: '2026-06-10T00:00:00Z', redeemed_school_id: 'b' },
    { price: 9999, redeemed_at: null, redeemed_school_id: null }, // pending
  ],
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

  it('sums pending collection and dormant = expired + paused', () => {
    expect(vm.pending).toEqual({ count: 1, total: 9999 })
    expect(vm.dormant).toBe(2) // Beta (expired) + Gamma (paused)
  })
})
