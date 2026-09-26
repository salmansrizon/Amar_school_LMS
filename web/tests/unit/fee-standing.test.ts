import { describe, it, expect } from 'vitest'
import { feeStanding, summarizeMonthFees } from '@/lib/fees'

describe('summarizeMonthFees', () => {
  it('totals received and due, and counts each standing', () => {
    const s = summarizeMonthFees([
      { pay_amount: 500, due_amount: 0 },
      { pay_amount: 300, due_amount: 200 },
      { pay_amount: 0, due_amount: 500 },
    ])
    expect(s).toEqual({ records: 3, collected: 800, due: 700, paid: 1, partial: 1, unpaid: 1 })
  })
  it('is all zeros for a month with no records', () => {
    expect(summarizeMonthFees([])).toEqual({ records: 0, collected: 0, due: 0, paid: 0, partial: 0, unpaid: 0 })
  })
})

describe('feeStanding (Monthly Fee Standing)', () => {
  it('has no standing without a record', () => {
    expect(feeStanding(undefined)).toBeNull()
  })
  it('is paid when nothing is due, even if nothing was received', () => {
    expect(feeStanding({ pay_amount: 500, due_amount: 0 })).toBe('paid')
    expect(feeStanding({ pay_amount: 0, due_amount: 0 })).toBe('paid')
  })
  it('is partial when something was received and something is due', () => {
    expect(feeStanding({ pay_amount: 300, due_amount: 200 })).toBe('partial')
  })
  it('is due when nothing was received', () => {
    expect(feeStanding({ pay_amount: 0, due_amount: 500 })).toBe('due')
  })
})
