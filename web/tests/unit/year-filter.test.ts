import { describe, it, expect, vi } from 'vitest'
import {
  applyGlobalYearFilterToOfferings,
  applyGlobalYearFilterToStudents,
  filterOfferingsByYearSelection,
} from '@/lib/school/year-filter'

// A minimal stand-in for a Supabase query builder: `.or()` is the only method
// the helper calls, so that's the only one worth faking. Returns a distinct
// object so "did filtering actually change the query" is observable.
function fakeQuery() {
  const or = vi.fn((filters: string) => ({ or, __filtered: filters }))
  return { or }
}

describe('applyGlobalYearFilterToOfferings (map #609, T5/#614)', () => {
  it('is a no-op for an empty selection (legacy School, no started-year history)', () => {
    const query = fakeQuery()
    const result = applyGlobalYearFilterToOfferings(query, [])
    expect(result).toBe(query)
    expect(query.or).not.toHaveBeenCalled()
  })

  it('composes an or() filter that lets NULL-year rows through unconditionally', () => {
    const query = fakeQuery()
    applyGlobalYearFilterToOfferings(query, [2027, 2026])
    expect(query.or).toHaveBeenCalledWith('academic_year.is.null,academic_year.in.(2027,2026)')
  })

  it('global selection {2027, 2026} keeps those years and hides 2025', () => {
    const query = fakeQuery()
    applyGlobalYearFilterToOfferings(query, [2027, 2026])
    const [filters] = query.or.mock.calls[0]
    expect(filters).toBe('academic_year.is.null,academic_year.in.(2027,2026)')
    expect(filters).not.toContain('2025')
  })

  it('selecting only the active year {2027} hides 2026 and 2025', () => {
    const query = fakeQuery()
    applyGlobalYearFilterToOfferings(query, [2027])
    expect(query.or).toHaveBeenCalledWith('academic_year.is.null,academic_year.in.(2027)')
  })

  it('never uses a bare .in(), which would hide NULL-year rows', () => {
    const query = fakeQuery()
    applyGlobalYearFilterToOfferings(query, [2027])
    const [filters] = query.or.mock.calls[0]
    expect(filters).toContain('academic_year.is.null')
  })
})

// applyGlobalYearFilterToStudents (issue #621's follow-up sweep): only the
// empty-selection short-circuit is worth a unit test here, mirroring
// shift-filter.test.ts's own treatment of applyGlobalShiftFilterToStudents —
// the real behavior issues its own Supabase queries internally (resolve
// matching Offerings, then matching Enrollments, then filter students), so
// mocking it would just re-assert the same hardcoded strings back at itself.
// That behavior is verified for real against live Postgres in
// tests/integration/year-selection.test.ts, including the promotion-lag
// scenario this helper's own doc comment describes.
describe('applyGlobalYearFilterToStudents (issue #621)', () => {
  it('is a no-op for an empty selection, without touching Supabase at all', async () => {
    const query = fakeQuery()
    const supabase = { from: vi.fn() } as unknown as Parameters<typeof applyGlobalYearFilterToStudents>[0]
    const result = await applyGlobalYearFilterToStudents(supabase, query, [])
    expect(result).toBe(query)
    expect(query.or).not.toHaveBeenCalled()
    expect(supabase.from).not.toHaveBeenCalled()
  })
})

describe('filterOfferingsByYearSelection (map #609, T6/#615 — Exams picker)', () => {
  const offerings = [
    { id: 'a', academic_year: 2027 },
    { id: 'b', academic_year: 2026 },
    { id: 'c', academic_year: 2025 },
    { id: 'd', academic_year: null },
  ]

  it('is a no-op for an empty selection (returns a copy of everything)', () => {
    const result = filterOfferingsByYearSelection(offerings, [])
    expect(result.map((o) => o.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(result).not.toBe(offerings)
  })

  it('keeps only Offerings in the selection, plus every NULL-year Offering', () => {
    const result = filterOfferingsByYearSelection(offerings, [2027, 2026])
    expect(result.map((o) => o.id)).toEqual(['a', 'b', 'd'])
  })

  it('selecting only the active year still lets NULL-year Offerings through', () => {
    const result = filterOfferingsByYearSelection(offerings, [2027])
    expect(result.map((o) => o.id)).toEqual(['a', 'd'])
  })

  it('agrees with applyGlobalYearFilterToOfferings on which non-NULL years pass', () => {
    const selection = [2027, 2025]
    const query = fakeQuery()
    applyGlobalYearFilterToOfferings(query, selection)
    const [filters] = query.or.mock.calls[0]
    for (const o of offerings) {
      const inMemoryKept = filterOfferingsByYearSelection([o], selection).length === 1
      const composedKeeps =
        o.academic_year == null || filters.includes(`.in.(${selection.join(',')})`) && selection.includes(o.academic_year)
      expect(inMemoryKept).toBe(composedKeeps)
    }
  })
})
