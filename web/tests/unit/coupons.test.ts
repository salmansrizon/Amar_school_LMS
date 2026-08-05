import { describe, it, expect } from 'vitest'
import { parseCouponValue } from '@/lib/super-admin/coupons'

describe('parseCouponValue', () => {
  it('keeps a percent as an integer 1..100', () => {
    expect(parseCouponValue('percent', '25')).toBe(25)
  })
  it('rejects a percent outside 1..100', () => {
    expect(parseCouponValue('percent', '0')).toBeNull()
    expect(parseCouponValue('percent', '150')).toBeNull()
  })
  it('rejects a fractional percent', () => {
    expect(parseCouponValue('percent', '10.5')).toBeNull()
  })
  it('converts a flat taka amount to poisha', () => {
    expect(parseCouponValue('flat', '500')).toBe(50000)
    expect(parseCouponValue('flat', '499.99')).toBe(49999)
  })
  it('rejects a non-positive flat amount', () => {
    expect(parseCouponValue('flat', '0')).toBeNull()
    expect(parseCouponValue('flat', '-5')).toBeNull()
  })
  it('rejects junk', () => {
    expect(parseCouponValue('flat', 'abc')).toBeNull()
  })
})
