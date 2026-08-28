import { describe, it, expect } from 'vitest'
import { sortFees, totalFees, monthLabel, payableOf, type FeeRecord } from '@/lib/student/fees'

const rec = (over: Partial<FeeRecord> & { id: string }): FeeRecord => ({
  month: 1,
  year: 2026,
  pay_amount: 0,
  fine_amount: 0,
  due_amount: 0,
  payment_method: 'cash',
  updated_at: '2026-01-01T00:00:00Z',
  ...over,
})

describe('sortFees', () => {
  it('puts the newest month first', () => {
    const sorted = sortFees([
      rec({ id: 'jan26', month: 1, year: 2026 }),
      rec({ id: 'dec25', month: 12, year: 2025 }),
      rec({ id: 'mar26', month: 3, year: 2026 }),
    ])
    expect(sorted.map((r) => r.id)).toEqual(['mar26', 'jan26', 'dec25'])
  })
})

describe('totalFees', () => {
  it('sums paid, fine and due', () => {
    expect(
      totalFees([
        rec({ id: 'a', pay_amount: 1000, fine_amount: 50, due_amount: 200 }),
        rec({ id: 'b', pay_amount: 500, fine_amount: 0, due_amount: 700 }),
      ]),
    ).toEqual({ payable: 2400, paid: 1500, fine: 50, due: 900 })
  })

  it('is zeroed for an empty record set, not NaN', () => {
    expect(totalFees([])).toEqual({ payable: 0, paid: 0, fine: 0, due: 0 })
  })

  it('never reports an adjustment — the view does not carry one (ADR 0015)', () => {
    const totals = totalFees([rec({ id: 'a', pay_amount: 100 })])
    expect(Object.keys(totals).sort()).toEqual(['due', 'fine', 'paid', 'payable'])
  })

  it('derives payable from the record, never from the list price (ADR 0015)', () => {
    // paid + still-owed is already net of any waiver, so it cannot be
    // subtracted from a fee_structures figure to reveal one.
    expect(payableOf(rec({ id: 'a', pay_amount: 600, due_amount: 400 }))).toBe(1000)
  })

  it('does not bill the fine twice — due already contains it', () => {
    // Staff side: totalPayable = fee + fine - adjust, due = totalPayable - pay.
    // So a 1,000 fee with a 50 fine and 600 paid leaves due 450, and the month
    // asked for 1,050 — not 1,100.
    expect(payableOf(rec({ id: 'a', pay_amount: 600, fine_amount: 50, due_amount: 450 }))).toBe(1050)
  })
})

describe('monthLabel', () => {
  it('names the month in each language', () => {
    expect(monthLabel(9, 2026, 'en')).toBe('Sep 2026')
    expect(monthLabel(9, 2026, 'bn')).toBe('সেপ ২০২৬')
  })

  it('degrades to the number rather than throwing on a bad month', () => {
    expect(monthLabel(13, 2026, 'en')).toBe('13 2026')
  })
})
