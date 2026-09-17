import { describe, it, expect } from 'vitest'
import { visibleSubjects, filterSubjectsByClass } from '@/lib/classes'

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

// Subject List's own per-Class filter (issue #641) — applied on top of
// visibleSubjects's Global Selection scoping.
describe('filterSubjectsByClass', () => {
  const subjects = [
    { id: 's1', class_id: 'c1' },
    { id: 's2', class_id: 'c2' },
    { id: 's3', class_id: null },
  ]

  it('returns every subject unfiltered when no class is chosen ("All Classes")', () => {
    expect(filterSubjectsByClass(subjects, undefined)).toEqual(subjects)
    expect(filterSubjectsByClass(subjects, null)).toEqual(subjects)
    expect(filterSubjectsByClass(subjects, '')).toEqual(subjects)
  })

  it('keeps only subjects whose class matches the chosen one', () => {
    expect(filterSubjectsByClass(subjects, 'c1').map((s) => s.id)).toEqual(['s1'])
  })

  it('drops a subject with no linked class once a specific class is chosen', () => {
    expect(filterSubjectsByClass(subjects, 'c1')).not.toContainEqual({ id: 's3', class_id: null })
  })

  it('returns an empty list when no subject matches the chosen class', () => {
    expect(filterSubjectsByClass(subjects, 'c9')).toEqual([])
  })
})
