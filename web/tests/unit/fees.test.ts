import { describe, it, expect } from 'vitest'
import { totalPayable, dueAmount, absentFineAmount, buildFeeStructureCopy, type FeeStructureCore } from '@/lib/fees'

// Accounting I (issue #34, PRD §5.6): fee structures + absent-fine calculator.
// Red-first per the map's TDD requirement — these are the pure pieces:
// Fee/Fine/Scholarship-Discount split arithmetic, the absent-fine amount
// (days × rate), and the copy-between-class/year payload builder.
//
// The working-days absence-count formula itself is NOT reimplemented/tested
// here in TypeScript — it lives once, in is_absent_working_day (0021,
// absence-SMS #12), reused by the absent_working_days_in_month RPC (0037).
// Its behaviour (including off-day/leave overlap) is covered against the
// real database in tests/integration/fee-structures.test.ts.

describe('totalPayable', () => {
  it('sums fee + fine, minus the scholarship/discount', () => {
    expect(totalPayable(1200, 0, 200)).toBe(1000)
    expect(totalPayable(1200, 100, 0)).toBe(1300)
  })

  it('never goes negative even if the discount exceeds fee + fine', () => {
    expect(totalPayable(100, 0, 500)).toBe(0)
  })
})

describe('dueAmount', () => {
  it('is the shortfall between total payable and received amount', () => {
    expect(dueAmount(1000, 700)).toBe(300)
  })

  it('is zero once received amount covers or exceeds total payable', () => {
    expect(dueAmount(1000, 1000)).toBe(0)
    expect(dueAmount(1000, 1500)).toBe(0)
  })
})

describe('absentFineAmount', () => {
  it('multiplies absent working days by the per-day fine rate', () => {
    expect(absentFineAmount(3, 50)).toBe(150)
  })

  it('is zero for zero absent days or a zero rate', () => {
    expect(absentFineAmount(0, 50)).toBe(0)
    expect(absentFineAmount(5, 0)).toBe(0)
  })

  it('clamps negative inputs to zero rather than producing a negative fine', () => {
    expect(absentFineAmount(-2, 50)).toBe(0)
    expect(absentFineAmount(3, -10)).toBe(0)
  })
})

describe('buildFeeStructureCopy (copy-between-class/year)', () => {
  const source: FeeStructureCore = {
    fee_type: 'monthly',
    amount: 1200,
    fine_per_absent_day: 50,
  }

  it('carries fee_type/amount/fine rate onto the target class and year', () => {
    expect(buildFeeStructureCopy(source, 'class-8-id', 2027)).toEqual({
      class_id: 'class-8-id',
      academic_year: 2027,
      fee_type: 'monthly',
      amount: 1200,
      fine_per_absent_day: 50,
    })
  })

  it('rejects a missing target class', () => {
    expect(() => buildFeeStructureCopy(source, '', 2027)).toThrow(/target class/i)
  })

  it('rejects an out-of-range target year', () => {
    expect(() => buildFeeStructureCopy(source, 'class-8-id', 1999)).toThrow(/target year/i)
    expect(() => buildFeeStructureCopy(source, 'class-8-id', 2101)).toThrow(/target year/i)
  })
})
