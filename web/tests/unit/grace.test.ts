import { describe, it, expect } from 'vitest'
import { effectiveGrace, effectiveGraceWithSource } from '@/lib/grace'

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

// Issue #30 (Attendance II): the employee-attendance screen annotates each
// row with which level won — same MAX rule, plus the source label.
describe('effectiveGraceWithSource', () => {
  it('reports the winning level for the mockup example (global 10, category 15, shift 12, override 20 -> 20/override)', () => {
    expect(effectiveGraceWithSource({ global: 10, category: 15, shifts: [12], override: 20 })).toEqual({
      minutes: 20,
      source: 'override',
    })
  })

  it('multi-shift workers report the larger shift value as the shift source', () => {
    expect(effectiveGraceWithSource({ global: 5, category: null, shifts: [10, 25], override: null })).toEqual({
      minutes: 25,
      source: 'shift',
    })
  })

  it('a smaller override never wins the label even though it is configured', () => {
    expect(effectiveGraceWithSource({ global: null, category: null, shifts: [20], override: 5 })).toEqual({
      minutes: 20,
      source: 'shift',
    })
  })

  it('ties resolve to the more specific level (override over shift over category over global)', () => {
    expect(effectiveGraceWithSource({ global: 15, category: 15, shifts: [15], override: 15 })).toEqual({
      minutes: 15,
      source: 'override',
    })
  })

  it('nothing configured -> zero minutes and no source', () => {
    expect(effectiveGraceWithSource({ global: null, category: null, shifts: [], override: null })).toEqual({
      minutes: 0,
      source: null,
    })
  })
})
