import { describe, it, expect } from 'vitest'
import { periodValid } from '@/lib/super-admin/settlements'

describe('periodValid', () => {
  it('accepts start ≤ end', () => {
    expect(periodValid('2026-01-01', '2026-01-31')).toBe(true)
    expect(periodValid('2026-01-01', '2026-01-01')).toBe(true)
  })
  it('rejects end before start', () => {
    expect(periodValid('2026-02-01', '2026-01-01')).toBe(false)
  })
  it('rejects missing dates', () => {
    expect(periodValid('', '2026-01-01')).toBe(false)
    expect(periodValid('2026-01-01', '')).toBe(false)
  })
})
