import { describe, it, expect } from 'vitest'
import { enrolledIdFilter } from '@/lib/school/offering-roster'
import { NO_MATCH_SENTINEL } from '@/lib/school/shift-filter'

// issue #596 — the empty-set guard every roster call site shares.
describe('enrolledIdFilter', () => {
  it('passes a non-empty id list through unchanged', () => {
    expect(enrolledIdFilter(['a', 'b'])).toEqual(['a', 'b'])
  })

  it('maps an empty roster to the never-matching sentinel (not an empty .in())', () => {
    // `.in('id', [])` is invalid PostgREST; the sentinel is how "match
    // nothing" is expressed, same as applyGlobalShiftFilterToStudents.
    expect(enrolledIdFilter([])).toEqual([NO_MATCH_SENTINEL])
  })
})
