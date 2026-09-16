import { describe, it, expect } from 'vitest'
import { visibleSubjects } from '@/lib/classes'

// Seam: Subject List's Global Shift/Academic Year Selection scoping (issue
// #637) — previously unfiltered, now narrowed to the same Classes set the
// page's Classes table already renders.

describe('visibleSubjects', () => {
  it('keeps a subject whose class is in the visible set', () => {
    const subjects = [{ id: 's1', class_id: 'c1' }]
    expect(visibleSubjects(subjects, new Set(['c1']))).toEqual(subjects)
  })

  it('drops a subject whose class was filtered out (deselected year/shift)', () => {
    const subjects = [{ id: 's1', class_id: 'c1' }]
    expect(visibleSubjects(subjects, new Set(['c2']))).toEqual([])
  })

  it('always keeps a subject with no linked class (pre-hardening rows)', () => {
    const subjects = [{ id: 's1', class_id: null }]
    expect(visibleSubjects(subjects, new Set())).toEqual(subjects)
  })

  it('filters a mixed list correctly', () => {
    const subjects = [
      { id: 's1', class_id: 'c1' },
      { id: 's2', class_id: 'c2' },
      { id: 's3', class_id: null },
    ]
    expect(visibleSubjects(subjects, new Set(['c1'])).map((s) => s.id)).toEqual(['s1', 's3'])
  })
})
