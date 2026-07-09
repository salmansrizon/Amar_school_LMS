import { describe, it, expect } from 'vitest'
import { studentCounts, countFor } from '@/lib/classes'

// Seam: free-text student class_name/section → per-class head count (issue #26).

describe('studentCounts', () => {
  const students = [
    { class_name: 'Class 8', section: 'A' },
    { class_name: 'Class 8', section: 'A' },
    { class_name: 'Class 8 ', section: ' A' }, // stray whitespace still matches
    { class_name: 'Class 8', section: 'B' },
    { class_name: 'Class 9', section: null },
    { class_name: null, section: 'A' }, // unassigned student is ignored
    { class_name: '  ', section: 'A' },
  ]

  it('counts students per trimmed class + section', () => {
    const counts = studentCounts(students)
    expect(countFor(counts, 'Class 8', 'A')).toBe(3)
    expect(countFor(counts, 'Class 8', 'B')).toBe(1)
  })

  it('treats a missing section as its own bucket', () => {
    const counts = studentCounts(students)
    expect(countFor(counts, 'Class 9', null)).toBe(1)
    expect(countFor(counts, 'Class 9', 'A')).toBe(0)
  })

  it('is zero for a class with no students', () => {
    expect(countFor(studentCounts(students), 'Class 10', 'A')).toBe(0)
  })
})
