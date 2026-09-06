import { describe, it, expect, vi } from 'vitest'
import { applyGlobalShiftFilterToOfferings, applyGlobalShiftFilterToStudents } from '@/lib/school/shift-filter'

// A minimal stand-in for a Supabase query builder: `.or()` is the only
// method either helper calls, so that's the only one worth faking. Records
// what it was called with and returns a distinct object each time (like the
// real builder does) so "did filtering actually change the object" is
// observable in these tests.
function fakeQuery() {
  const or = vi.fn((filters: string) => ({ or, __filtered: filters }))
  return { or }
}

describe('applyGlobalShiftFilterToOfferings (issue #579)', () => {
  it('is a no-op for an empty selection (No-Shift institute)', () => {
    const query = fakeQuery()
    const result = applyGlobalShiftFilterToOfferings(query, [])
    expect(result).toBe(query)
    expect(query.or).not.toHaveBeenCalled()
  })

  it('composes an or() filter that lets NULL-shift rows through unconditionally', () => {
    const query = fakeQuery()
    applyGlobalShiftFilterToOfferings(query, ['Morning', 'Day'])
    expect(query.or).toHaveBeenCalledWith('shift.is.null,shift.in.(Morning,Day)')
  })

  it('never uses a bare .in(), which would hide NULL-shift rows', () => {
    const query = fakeQuery()
    applyGlobalShiftFilterToOfferings(query, ['Morning'])
    const [filters] = query.or.mock.calls[0]
    expect(filters).toContain('shift.is.null')
  })
})

describe('applyGlobalShiftFilterToStudents (issue #579)', () => {
  // Only the empty-selection short-circuit is worth a unit test here: the
  // real behavior (resolving matching Enrollments through class_offerings,
  // then filtering students.current_enrollment_id) issues its own Supabase
  // queries internally, so mocking it would just re-assert the same
  // hardcoded strings back at itself. That behavior is verified for real
  // against live Postgres in tests/integration/shift-selection.test.ts —
  // deliberately so, since the naive single-query embedded-filter design
  // this replaced looked correct on paper and wasn't (see shift-filter.ts's
  // own comment on why).
  it('is a no-op for an empty selection, without touching Supabase at all', async () => {
    const query = fakeQuery()
    const supabase = { from: vi.fn() } as unknown as Parameters<typeof applyGlobalShiftFilterToStudents>[0]
    const result = await applyGlobalShiftFilterToStudents(supabase, query, [])
    expect(result).toBe(query)
    expect(query.or).not.toHaveBeenCalled()
    expect(supabase.from).not.toHaveBeenCalled()
  })
})
