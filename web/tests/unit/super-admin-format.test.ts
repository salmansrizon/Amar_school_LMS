import { describe, it, expect } from 'vitest'
import { formatTaka } from '@/components/super-admin/dashboard-ui'

describe('formatTaka', () => {
  it('prefixes ৳ and groups thousands', () => {
    expect(formatTaka(5000)).toBe('৳5,000')
    expect(formatTaka(1234567)).toBe('৳1,234,567')
    expect(formatTaka(0)).toBe('৳0')
  })
  it('rounds to whole taka', () => {
    expect(formatTaka(4999.6)).toBe('৳5,000')
  })
})
