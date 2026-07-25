import { describe, it, expect } from 'vitest'
import { smsBalance } from '@/lib/sms/credit'

describe('smsBalance', () => {
  it('is the signed sum of top-ups and send debits', () => {
    expect(smsBalance([{ delta: 5000 }, { delta: -1 }, { delta: -3 }])).toBe(4996)
  })
  it('is 0 for a school with no ledger rows', () => {
    expect(smsBalance([])).toBe(0)
  })
  it('can go negative when sends outran top-ups (enforcement was off)', () => {
    expect(smsBalance([{ delta: 10 }, { delta: -12 }])).toBe(-2)
  })
})
