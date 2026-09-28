import { describe, it, expect } from 'vitest'
import { effectiveGrace, effectiveGraceWithSource } from '@/lib/grace'

// The Considerable Grace Window rule (issue #9, redesigned by #671): the
// effective grace is the MAX across every applicable configured value —
// never the stricter one. Office Time and the individual override were
// retired (ADR 0030); Prayer & Tiffin Window and Ad-Hoc Grace Exemption
// (both Employee-Category based, the latter date-scoped) took their place.
describe('effectiveGrace', () => {
  it('takes the max across all applicable levels', () => {
    expect(effectiveGrace({ global: 5, category: 15, prayerTiffin: 10, adHoc: 8 })).toBe(15)
  })

  it('a smaller Prayer & Tiffin Window never forces a stricter result', () => {
    expect(effectiveGrace({ global: null, category: null, prayerTiffin: 5, adHoc: 20 })).toBe(20)
  })

  it('an Ad-Hoc Grace Exemption larger than everything else wins', () => {
    expect(effectiveGrace({ global: 5, category: 10, prayerTiffin: 15, adHoc: 45 })).toBe(45)
  })

  it('unconfigured levels are ignored; nothing configured means zero grace', () => {
    expect(effectiveGrace({ global: null, category: null, prayerTiffin: null, adHoc: null })).toBe(0)
    expect(effectiveGrace({ global: 7, category: null, prayerTiffin: null, adHoc: null })).toBe(7)
  })
})

// Issue #30 (Attendance II), extended by #671: the employee-attendance screen
// annotates each row with which level won — same MAX rule, plus the source.
describe('effectiveGraceWithSource', () => {
  it('reports the winning level (global 10, category 15, prayerTiffin 12, adHoc 20 -> 20/adHoc)', () => {
    expect(effectiveGraceWithSource({ global: 10, category: 15, prayerTiffin: 12, adHoc: 20 })).toEqual({
      minutes: 20,
      source: 'adHoc',
    })
  })

  it('a smaller adHoc never wins the label even though it is configured', () => {
    expect(effectiveGraceWithSource({ global: null, category: null, prayerTiffin: 20, adHoc: 5 })).toEqual({
      minutes: 20,
      source: 'prayerTiffin',
    })
  })

  it('ties resolve to the more specific level (adHoc over prayerTiffin over category over global)', () => {
    expect(effectiveGraceWithSource({ global: 15, category: 15, prayerTiffin: 15, adHoc: 15 })).toEqual({
      minutes: 15,
      source: 'adHoc',
    })
  })

  it('a category tie without an adHoc value resolves to prayerTiffin over category', () => {
    expect(effectiveGraceWithSource({ global: 10, category: 10, prayerTiffin: 10, adHoc: null })).toEqual({
      minutes: 10,
      source: 'prayerTiffin',
    })
  })

  it('nothing configured -> zero minutes and no source', () => {
    expect(effectiveGraceWithSource({ global: null, category: null, prayerTiffin: null, adHoc: null })).toEqual({
      minutes: 0,
      source: null,
    })
  })
})
