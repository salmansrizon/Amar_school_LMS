import { describe, it, expect } from 'vitest'
import { studentCounts, countFor } from '@/lib/classes'

// Seam: per-Class-Offering head count via student_enrollments.class_offering_id
// (map #568/#582, issue #586) — replaces issue #26's free-text class_name/
// section matching, which studentCounts/countFor no longer implement.

describe('studentCounts', () => {
  const OFFERING_8A = 'offering-8a'
  const OFFERING_8B = 'offering-8b'
  const OFFERING_9 = 'offering-9'
  const OFFERING_10 = 'offering-10' // never enrolled

  const enrollments = [
    { class_offering_id: OFFERING_8A },
    { class_offering_id: OFFERING_8A },
    { class_offering_id: OFFERING_8A },
    { class_offering_id: OFFERING_8B },
    { class_offering_id: OFFERING_9 },
  ]

  it('counts current enrollments per Class Offering', () => {
    const counts = studentCounts(enrollments)
    expect(countFor(counts, OFFERING_8A)).toBe(3)
    expect(countFor(counts, OFFERING_8B)).toBe(1)
  })

  it('is zero for a Class Offering with no enrollments', () => {
    expect(countFor(studentCounts(enrollments), OFFERING_10)).toBe(0)
  })

  it('an empty enrollment list counts everything as zero', () => {
    expect(countFor(studentCounts([]), OFFERING_9)).toBe(0)
  })
})
