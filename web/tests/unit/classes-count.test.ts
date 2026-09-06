import { describe, it, expect } from 'vitest'
import { studentCounts, countFor, homeworkTargetsOffering } from '@/lib/classes'

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

// #587's own Wave 4a planning-pass finding: my-classes/page.tsx's inline
// homework filter never checked target_type, so a target_type='all' homework
// never appeared on any Class Teacher's list — a real bug, independent of
// the Notices targeting SQL rewrite. Regression-pinned here now that the
// filter is a named, testable function instead of inline JSX logic.
describe('homeworkTargetsOffering', () => {
  const nineA = { name: 'Nine', section: 'A' }

  it("a target_type='all' task always matches, regardless of class/section", () => {
    expect(
      homeworkTargetsOffering({ target_type: 'all', target_class_name: null, target_section: null }, nineA),
    ).toBe(true)
    // Even a class-only-looking name that doesn't match this Offering at all —
    // 'all' overrides every other field.
    expect(
      homeworkTargetsOffering({ target_type: 'all', target_class_name: 'Ten', target_section: 'Z' }, nineA),
    ).toBe(true)
  })

  it('a specific target with no section reaches every section of that class', () => {
    expect(
      homeworkTargetsOffering({ target_type: 'specific', target_class_name: 'Nine', target_section: null }, nineA),
    ).toBe(true)
    expect(
      homeworkTargetsOffering(
        { target_type: 'specific', target_class_name: 'Nine', target_section: null },
        { name: 'Nine', section: 'B' },
      ),
    ).toBe(true)
  })

  it('a specific target with a section narrows to that section only', () => {
    expect(
      homeworkTargetsOffering({ target_type: 'specific', target_class_name: 'Nine', target_section: 'A' }, nineA),
    ).toBe(true)
    expect(
      homeworkTargetsOffering(
        { target_type: 'specific', target_class_name: 'Nine', target_section: 'A' },
        { name: 'Nine', section: 'B' },
      ),
    ).toBe(false)
  })

  it('a specific target for a different class never matches', () => {
    expect(
      homeworkTargetsOffering({ target_type: 'specific', target_class_name: 'Ten', target_section: null }, nineA),
    ).toBe(false)
  })

  it('a section-only target (no class chosen) reaches every class in that section', () => {
    // Caught by code review alongside the SQL-side fix (student_matches_target
    // dropped this same null-class guard) — a valid, create-form-permitted
    // submission (validateTargetSelection only requires className OR section).
    expect(
      homeworkTargetsOffering({ target_type: 'specific', target_class_name: null, target_section: 'A' }, nineA),
    ).toBe(true)
    expect(
      homeworkTargetsOffering(
        { target_type: 'specific', target_class_name: null, target_section: 'A' },
        { name: 'Ten', section: 'B' },
      ),
    ).toBe(false)
  })
})
