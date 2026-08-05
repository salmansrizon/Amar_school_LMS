import { describe, it, expect } from 'vitest'
import { takaToPoisha } from '@/lib/money'
import { parseSegments } from '@/lib/super-admin/sms-packages'

describe('takaToPoisha', () => {
  it('converts taka to integer poisha', () => {
    expect(takaToPoisha('500')).toBe(50000)
    expect(takaToPoisha('12.34')).toBe(1234)
  })
  it('rejects non-positive / junk', () => {
    expect(takaToPoisha('0')).toBeNull()
    expect(takaToPoisha('-1')).toBeNull()
    expect(takaToPoisha('abc')).toBeNull()
  })
})

describe('parseSegments', () => {
  it('accepts a positive integer', () => {
    expect(parseSegments('1000')).toBe(1000)
  })
  it('rejects zero, negatives, fractions, junk', () => {
    expect(parseSegments('0')).toBeNull()
    expect(parseSegments('-5')).toBeNull()
    expect(parseSegments('1.5')).toBeNull()
    expect(parseSegments('x')).toBeNull()
  })
})
