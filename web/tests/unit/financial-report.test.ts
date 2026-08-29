import { describe, expect, it } from 'vitest'
import { formatTaka } from '@/lib/super-admin/financial-report'

describe('formatTaka', () => {
  it('renders poisha as Taka with two decimals', () => {
    expect(formatTaka(270000)).toBe('৳2,700.00')
    expect(formatTaka(50)).toBe('৳0.50')
    expect(formatTaka(0)).toBe('৳0.00')
  })
})
