import { describe, it, expect } from 'vitest'
import { feeStanding } from '@/lib/fees'

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
