import { describe, it, expect } from 'vitest'
import {
  insufficientBalance,
  currentAssetValue,
  buildGeneralLedger,
  type LedgerSourceRow,
} from '@/lib/accounting'

describe('insufficientBalance (Accounting II, issue #35)', () => {
  it('is true when the withdrawal exceeds the balance', () => {
    expect(insufficientBalance(32500, 50000)).toBe(true)
  })
  it('is false when the withdrawal is within the balance', () => {
    expect(insufficientBalance(32500, 32500)).toBe(false)
    expect(insufficientBalance(32500, 1000)).toBe(false)
  })
})

describe('currentAssetValue (straight-line depreciation)', () => {
  it('is unchanged before the first anniversary', () => {
    expect(currentAssetValue(45000, 15, '2026-01-12', '2026-06-01')).toBe(45000)
  })
  it('drops by one year of depreciation right on the anniversary', () => {
    // 45000 * 0.15 = 6750 depreciated after exactly one full year.
    expect(currentAssetValue(45000, 15, '2026-01-12', '2027-01-12')).toBe(45000 - 6750)
  })
  it('counts only full years elapsed (floor), not partial years', () => {
    // Just short of the second anniversary: still only 1 full year counted.
    expect(currentAssetValue(45000, 15, '2024-01-12', '2026-01-11')).toBe(45000 - 6750)
    // On/after the second anniversary: 2 full years counted.
    expect(currentAssetValue(45000, 15, '2024-01-12', '2026-01-12')).toBe(45000 - 6750 * 2)
  })
  it('never goes negative even with a high rate over many years', () => {
    expect(currentAssetValue(10000, 50, '2010-01-01', '2026-01-01')).toBe(0)
  })
  it('a 0% rate never depreciates', () => {
    expect(currentAssetValue(50000, 0, '2010-01-01', '2026-01-01')).toBe(50000)
  })
})

describe('buildGeneralLedger (Accounting II consolidated ledger)', () => {
  const rows: LedgerSourceRow[] = [
    {
      date: '2026-07-01',
      sortKey: '2026-07-01T08:00:00Z',
      source: 'fee_collection',
      description: 'Sadia Islam — July fee',
      debit: 0,
      credit: 1000,
    },
    {
      date: '2026-07-03',
      sortKey: '2026-07-03T09:00:00Z',
      source: 'voucher',
      description: 'Electricity bill',
      debit: 4800,
      credit: 0,
    },
    {
      date: '2026-07-05',
      sortKey: '2026-07-05T10:00:00Z',
      source: 'bank_cash',
      description: 'Bank deposit',
      debit: 0,
      credit: 20000,
    },
    {
      date: '2026-06-20',
      sortKey: '2026-06-20T11:00:00Z',
      source: 'director_capital',
      description: 'Invest — expansion',
      debit: 0,
      credit: 100000,
    },
    {
      date: '2024-01-12',
      sortKey: '2024-01-12T12:00:00Z',
      source: 'asset',
      description: 'Projector purchase',
      debit: 45000,
      credit: 0,
    },
  ]

  it('sorts chronologically (not insertion order) and computes a running balance across all history', () => {
    const entries = buildGeneralLedger(rows, '2000-01-01', '2100-01-01')
    expect(entries.map((e) => e.date)).toEqual([
      '2024-01-12',
      '2026-06-20',
      '2026-07-01',
      '2026-07-03',
      '2026-07-05',
    ])
    // -45000, +100000 => 55000, +1000 => 56000, -4800 => 51200, +20000 => 71200
    expect(entries.map((e) => e.balance)).toEqual([-45000, 55000, 56000, 51200, 71200])
  })

  it('filters the visible rows to the date range but keeps the running balance anchored to full history', () => {
    const entries = buildGeneralLedger(rows, '2026-07-01', '2026-07-31')
    expect(entries.map((e) => e.date)).toEqual(['2026-07-01', '2026-07-03', '2026-07-05'])
    // Balance still reflects the 2024 asset purchase and the June investment.
    expect(entries.map((e) => e.balance)).toEqual([56000, 51200, 71200])
  })

  it('date range bounds are inclusive', () => {
    const entries = buildGeneralLedger(rows, '2026-07-01', '2026-07-01')
    expect(entries).toHaveLength(1)
    expect(entries[0].description).toBe('Sadia Islam — July fee')
  })

  it('same-day entries keep a stable order via sortKey', () => {
    const sameDay: LedgerSourceRow[] = [
      { date: '2026-07-01', sortKey: '2026-07-01T10:00:00Z', source: 'voucher', description: 'B', debit: 1, credit: 0 },
      { date: '2026-07-01', sortKey: '2026-07-01T08:00:00Z', source: 'voucher', description: 'A', debit: 1, credit: 0 },
    ]
    const entries = buildGeneralLedger(sameDay, '2026-07-01', '2026-07-01')
    expect(entries.map((e) => e.description)).toEqual(['A', 'B'])
  })
})
