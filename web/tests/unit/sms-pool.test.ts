import { describe, it, expect } from 'vitest'
import { poolBalance, poolLevel, SMS_POOL_LOW } from '@/lib/sms/pool'

describe('poolBalance', () => {
  it('is the signed sum of every pool ledger row (buy + / send −)', () => {
    expect(poolBalance([{ delta: 10000 }, { delta: -5000 }, { delta: -2000 }])).toBe(3000)
  })
  it('is 0 for an empty pool', () => {
    expect(poolBalance([])).toBe(0)
  })
  it('can go negative when sends outran purchases', () => {
    expect(poolBalance([{ delta: 1000 }, { delta: -1500 }])).toBe(-500)
  })
})

describe('poolLevel', () => {
  it('empty at or below zero, low up to the threshold, else ok', () => {
    expect(poolLevel(0)).toBe('empty')
    expect(poolLevel(-100)).toBe('empty')
    expect(poolLevel(1)).toBe('low')
    expect(poolLevel(SMS_POOL_LOW)).toBe('low')
    expect(poolLevel(SMS_POOL_LOW + 1)).toBe('ok')
  })
})
