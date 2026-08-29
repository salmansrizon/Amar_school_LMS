import { describe, it, expect } from 'vitest'
import { poolBalance, poolLevel, summarizeSmsPool, SMS_POOL_LOW } from '@/lib/sms/pool'

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
  it('empty at zero, low up to the threshold, else ok', () => {
    expect(poolLevel(0)).toBe('empty')
    expect(poolLevel(1)).toBe('low')
    expect(poolLevel(SMS_POOL_LOW)).toBe('low')
    expect(poolLevel(SMS_POOL_LOW + 1)).toBe('ok')
  })
})

// #529: -981 rendered as an ordinary KPI beside the words "pool is empty".
// A negative pool is not an empty pool — it says segments left the gateway that
// were never bought, so the ledger and reality disagree.
describe('an impossible pool is not an empty one (#529)', () => {
  it('calls a negative balance impossible, not empty', () => {
    expect(poolLevel(-981)).toBe('impossible')
    expect(poolLevel(-1)).toBe('impossible')
  })

  it('still calls a genuinely spent pool empty', () => {
    expect(poolLevel(0)).toBe('empty')
  })

  it('leaves the low and ok buckets alone', () => {
    expect(poolLevel(1)).toBe('low')
    expect(poolLevel(SMS_POOL_LOW)).toBe('low')
    expect(poolLevel(SMS_POOL_LOW + 1)).toBe('ok')
  })

  it('summarizes a pool that was only ever debited', () => {
    const rows = Array.from({ length: 3 }, () => ({ delta: -327 }))
    expect(summarizeSmsPool(rows)).toEqual({ balance: -981, level: 'impossible', bought: 0, sent: 981 })
  })
})
