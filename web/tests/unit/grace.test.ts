import { describe, it, expect } from 'vitest'
import { effectiveGrace, effectiveGraceWithSource, isGraceDetail, GRACE_DETAILS } from '@/lib/grace'

// The Considerable Grace Window rule (issue #9, redesigned by #671 and #673):
// the effective grace is the MAX across every Standing Grace Rule covering the
// Employee's Category (any Shift — ADR 0032) and that date's Ad-Hoc Grace
// Exemption — never the stricter one, never summed.
describe('effectiveGrace', () => {
  it('takes the max across every applicable rule', () => {
    expect(
      effectiveGrace({
        standing: [
          { detail: 'Prayer', minutes: 20 },
          { detail: 'Lunch Hour', minutes: 30 },
        ],
        adHoc: 8,
      }),
    ).toBe(30)
  })

  it('an Ad-Hoc Grace Exemption larger than every standing rule wins', () => {
    expect(effectiveGrace({ standing: [{ detail: 'General', minutes: 10 }], adHoc: 45 })).toBe(45)
  })

  it('nothing configured means zero grace', () => {
    expect(effectiveGrace({ standing: [], adHoc: null })).toBe(0)
  })
})

describe('effectiveGraceWithSource', () => {
  it('credits the winning Grace Detail', () => {
    expect(
      effectiveGraceWithSource({
        standing: [
          { detail: 'Prayer', minutes: 20 },
          { detail: 'Lunch Hour', minutes: 30 },
        ],
        adHoc: null,
      }),
    ).toEqual({ minutes: 30, source: { kind: 'standing', detail: 'Lunch Hour' } })
  })

  it('a smaller Ad-Hoc value never wins the label', () => {
    expect(effectiveGraceWithSource({ standing: [{ detail: 'Tiffin', minutes: 20 }], adHoc: 5 })).toEqual({
      minutes: 20,
      source: { kind: 'standing', detail: 'Tiffin' },
    })
  })

  it('ties resolve to Ad-Hoc first, then Grace Detail list order', () => {
    expect(effectiveGraceWithSource({ standing: [{ detail: 'General', minutes: 15 }], adHoc: 15 })).toEqual({
      minutes: 15,
      source: { kind: 'adHoc' },
    })
    expect(
      effectiveGraceWithSource({
        standing: [
          { detail: 'Meeting', minutes: 15 },
          { detail: 'Prayer', minutes: 15 },
        ],
        adHoc: null,
      }),
    ).toEqual({ minutes: 15, source: { kind: 'standing', detail: 'Prayer' } })
  })

  it('nothing configured -> zero minutes and no source', () => {
    expect(effectiveGraceWithSource({ standing: [], adHoc: null })).toEqual({ minutes: 0, source: null })
  })
})

describe('isGraceDetail', () => {
  it('accepts only the fixed list', () => {
    for (const d of GRACE_DETAILS) expect(isGraceDetail(d)).toBe(true)
    expect(isGraceDetail('Coffee Break')).toBe(false)
  })
})
