import { describe, it, expect } from 'vitest'
import { effectiveGrace } from '@/lib/grace'

// The Considerable Grace Window rule (issue #9, PRD §5.2): the effective grace
// is the MAX across every applicable configured value — never the stricter one.
describe('effectiveGrace', () => {
  it('takes the max across all applicable levels', () => {
    expect(effectiveGrace({ global: 5, category: 15, shifts: [10], override: 8 })).toBe(15)
  })

  it('multi-shift workers get the larger shift value', () => {
    expect(effectiveGrace({ global: null, category: null, shifts: [10, 25], override: null })).toBe(25)
  })

  it('a per-individual override smaller than an applicable value never forces stricter', () => {
    // Override 5, shift 20 → 20. The override widens, never narrows.
    expect(effectiveGrace({ global: null, category: null, shifts: [20], override: 5 })).toBe(20)
  })

  it('an override larger than everything else wins', () => {
    expect(effectiveGrace({ global: 5, category: 10, shifts: [15], override: 45 })).toBe(45)
  })

  it('unconfigured levels are ignored; nothing configured means zero grace', () => {
    expect(effectiveGrace({ global: null, category: null, shifts: [], override: null })).toBe(0)
    expect(effectiveGrace({ global: 7, category: null, shifts: [], override: null })).toBe(7)
  })
})
