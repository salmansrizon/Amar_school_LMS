import { describe, it, expect } from 'vitest'
import {
  monthKeysEndingAt,
  incomeSeries,
  deltaPercent,
  latestIncome,
  dormantCount,
  pendingCollection,
  perSchoolLedger,
  lastPaidPrice,
  payableForecast,
  type CodeRow,
} from '@/lib/super-admin/financials'
import type { SoonExpiring, SchoolKpis } from '@/lib/super-admin/dashboard'

const ASOF = new Date('2026-07-15T10:00:00Z')

function code(over: Partial<CodeRow>): CodeRow {
  return {
    price: over.price ?? 0,
    redeemed_at: over.redeemed_at ?? null,
    redeemed_school_id: over.redeemed_school_id ?? null,
  }
}

describe('monthKeysEndingAt', () => {
  it('returns N ascending YYYY-MM keys ending at the asOf month', () => {
    expect(monthKeysEndingAt(ASOF, 3)).toEqual(['2026-05', '2026-06', '2026-07'])
  })
  it('rolls across a year boundary', () => {
    expect(monthKeysEndingAt(new Date('2026-02-01T00:00:00Z'), 4)).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ])
  })
})

describe('incomeSeries', () => {
  it('sums redeemed code prices per month, in order, zero-filling empty months', () => {
    const codes = [
      code({ price: 5000, redeemed_at: '2026-07-03T00:00:00Z', redeemed_school_id: 'a' }),
      code({ price: 3000, redeemed_at: '2026-07-20T00:00:00Z', redeemed_school_id: 'b' }),
      code({ price: 4000, redeemed_at: '2026-06-10T00:00:00Z', redeemed_school_id: 'c' }),
      code({ price: 9999, redeemed_at: null }), // unredeemed → never income
    ]
    expect(incomeSeries(codes, { asOf: ASOF, months: 3 })).toEqual([
      { month: '2026-05', total: 0 },
      { month: '2026-06', total: 4000 },
      { month: '2026-07', total: 8000 },
    ])
  })
})

describe('deltaPercent', () => {
  it('signed rounded percent vs the previous value', () => {
    expect(deltaPercent(8000, 4000)).toBe(100)
    expect(deltaPercent(3000, 4000)).toBe(-25)
  })
  it('is null when the previous value is zero (no baseline)', () => {
    expect(deltaPercent(5000, 0)).toBeNull()
  })
})

describe('latestIncome', () => {
  it('takes the last month total and its delta vs the previous month', () => {
    const series = [
      { month: '2026-05', total: 0 },
      { month: '2026-06', total: 4000 },
      { month: '2026-07', total: 8000 },
    ]
    expect(latestIncome(series)).toEqual({ total: 8000, delta: 100 })
  })
  it('delta is null with fewer than two months, total 0 for empty', () => {
    expect(latestIncome([{ month: '2026-07', total: 5000 }])).toEqual({ total: 5000, delta: null })
    expect(latestIncome([])).toEqual({ total: 0, delta: null })
  })
})

describe('dormantCount', () => {
  it('is expired + blocked (paused) — every not-currently-active school', () => {
    const kpis: SchoolKpis = { total: 10, trial: 2, active: 4, expired: 3, blocked: 1, soonExpiring: [] }
    expect(dormantCount(kpis)).toBe(4)
  })
})

describe('pendingCollection', () => {
  it('counts and sums codes created but not yet redeemed', () => {
    const codes = [
      code({ price: 5000, redeemed_at: '2026-07-01T00:00:00Z', redeemed_school_id: 'a' }),
      code({ price: 2000, redeemed_at: null }),
      code({ price: 1000, redeemed_at: null }),
    ]
    expect(pendingCollection(codes)).toEqual({ count: 2, total: 3000 })
  })
})

describe('perSchoolLedger', () => {
  it('months paid = redeemed code count, total = sum price, per school', () => {
    const codes = [
      code({ price: 5000, redeemed_at: '2026-05-01T00:00:00Z', redeemed_school_id: 'a' }),
      code({ price: 5000, redeemed_at: '2026-07-01T00:00:00Z', redeemed_school_id: 'a' }),
      code({ price: 3000, redeemed_at: '2026-06-01T00:00:00Z', redeemed_school_id: 'b' }),
      code({ price: 1000, redeemed_at: null }), // unredeemed ignored
    ]
    const ledger = perSchoolLedger(codes)
    expect(ledger).toContainEqual({ schoolId: 'a', monthsPaid: 2, totalPaid: 10000 })
    expect(ledger).toContainEqual({ schoolId: 'b', monthsPaid: 1, totalPaid: 3000 })
    expect(ledger).toHaveLength(2)
  })
})

describe('lastPaidPrice', () => {
  it('is the price of the school’s most recently redeemed code', () => {
    const codes = [
      code({ price: 5000, redeemed_at: '2026-05-01T00:00:00Z', redeemed_school_id: 'a' }),
      code({ price: 6000, redeemed_at: '2026-07-01T00:00:00Z', redeemed_school_id: 'a' }),
    ]
    expect(lastPaidPrice(codes, 'a')).toBe(6000)
  })
  it('is null for a school with no redeemed codes', () => {
    expect(lastPaidPrice([], 'ghost')).toBeNull()
  })
})

describe('payableForecast', () => {
  const soon: SoonExpiring[] = [
    { id: 'a', name: 'Alpha', expiry: '2026-07-20', daysLeft: 5 },
    { id: 'b', name: 'Beta', expiry: '2026-07-22', daysLeft: 7 },
  ]
  it('attaches each expiring school’s last-paid price and totals the known ones', () => {
    const codes = [
      code({ price: 6000, redeemed_at: '2026-01-01T00:00:00Z', redeemed_school_id: 'a' }),
      // Beta never redeemed a code → unknown forecast
    ]
    const { rows, total } = payableForecast(soon, codes)
    expect(rows).toEqual([
      { id: 'a', name: 'Alpha', expiry: '2026-07-20', daysLeft: 5, lastPaid: 6000 },
      { id: 'b', name: 'Beta', expiry: '2026-07-22', daysLeft: 7, lastPaid: null },
    ])
    expect(total).toBe(6000)
  })
})
