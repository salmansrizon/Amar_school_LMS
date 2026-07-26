import { describe, it, expect } from 'vitest'
import { smsBalance, smsBalanceLevel, SMS_LOW_BALANCE } from '@/lib/sms/credit'

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

describe('smsBalanceLevel', () => {
  it('empty at or below zero, low up to the threshold, else ok', () => {
    expect(smsBalanceLevel(0)).toBe('empty')
    expect(smsBalanceLevel(-5)).toBe('empty')
    expect(smsBalanceLevel(1)).toBe('low')
    expect(smsBalanceLevel(SMS_LOW_BALANCE)).toBe('low')
    expect(smsBalanceLevel(SMS_LOW_BALANCE + 1)).toBe('ok')
  })
})
