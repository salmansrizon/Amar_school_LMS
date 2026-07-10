import { describe, it, expect } from 'vitest'
import {
  totalPayable,
  dueAmount,
  absentFineAmount,
  daysInMonth,
  countAbsentWorkingDays,
  buildFeeStructureCopy,
  type FeeStructureCore,
} from '@/lib/fees'

// Accounting I (issue #34, PRD §5.6): fee structures + absent-fine calculator.
// Red-first per the map's TDD requirement — these are the pure pieces:
// Fee/Fine/Scholarship-Discount split arithmetic, the working-days absence
// formula (shared definition with the absence-SMS feature, issue #12), and
// the copy-between-class/year payload builder.

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

describe('daysInMonth', () => {
  it('lists every ISO date in a 31-day month', () => {
    const days = daysInMonth(2026, 7)
    expect(days).toHaveLength(31)
    expect(days[0]).toBe('2026-07-01')
    expect(days[30]).toBe('2026-07-31')
  })

  it('handles February in a non-leap year', () => {
    expect(daysInMonth(2026, 2)).toHaveLength(28)
  })

  it('handles February in a leap year', () => {
    expect(daysInMonth(2024, 2)).toHaveLength(29)
  })
})

describe('countAbsentWorkingDays (shared working-days formula)', () => {
  // Total − Off Days − Approved Leave − Present, with off-day/leave overlap
  // handled by short-circuiting per day (mirrors is_absent_working_day, 0021).
  const days = ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05']

  it('counts days that are not off, not on leave, and not present', () => {
    // 07-01 present, 07-02 off day, rest absent
    const count = countAbsentWorkingDays(days, ['2026-07-02'], [], ['2026-07-01'])
    expect(count).toBe(3)
  })

  it('excludes days covered by an approved leave range', () => {
    const count = countAbsentWorkingDays(
      days,
      [],
      [{ from_day: '2026-07-03', to_day: '2026-07-04' }],
      [],
    )
    expect(count).toBe(3) // 07-01, 07-02, 07-05
  })

  it('handles off-day/leave overlap without double-subtracting', () => {
    // 07-02 is both an off day AND inside the leave range — must only drop
    // the total by one for that day, not two.
    const count = countAbsentWorkingDays(
      days,
      ['2026-07-02'],
      [{ from_day: '2026-07-01', to_day: '2026-07-02' }],
      [],
    )
    // absent working days = 07-03, 07-04, 07-05 (07-01 on leave, 07-02 off+leave)
    expect(count).toBe(3)
  })

  it('returns zero when every day is present, off, or on leave', () => {
    const count = countAbsentWorkingDays(
      days,
      ['2026-07-01', '2026-07-02'],
      [{ from_day: '2026-07-03', to_day: '2026-07-05' }],
      [],
    )
    expect(count).toBe(0)
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
