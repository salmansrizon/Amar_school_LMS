import { describe, it, expect } from 'vitest'
import { studentCounts, countFor, homeworkTargetsOffering, type HomeworkTargetRow } from '@/lib/classes'
import type { OfferingRow } from '@/lib/publishing'
import { PUBLICATION_TARGET_SCENARIOS } from '@/lib/publishing-targeting-scenarios'

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
//
// Offering-aware since map #598 Wave 4 (#605): homeworkTargetsOffering is
// now a thin wrapper over the shared resolution primitive
// (targetRowMatchesOffering, lib/publishing.ts). The legacy-shape tests
// below build a full HomeworkTargetRow/OfferingRow with target_scope: null
// and the new columns defaulted -- a not-yet-migrated row, exercising the
// same fallback path #603/#604's own SQL-side legacy predicate takes.
describe('homeworkTargetsOffering', () => {
  function legacyTask(overrides: Partial<HomeworkTargetRow> & { target_type: string }): HomeworkTargetRow {
    return {
      target_scope: null,
      class_offering_id: null,
      target_academic_year: null,
      target_shift: null,
      target_group_department: null,
      target_class_name: null,
      target_section: null,
      ...overrides,
    }
  }

  function offering(overrides: Partial<OfferingRow> & { name: string }): OfferingRow {
    return {
      id: 'unused-in-legacy-path',
      academic_year: null,
      shift: null,
      group_department: null,
      section: null,
      ...overrides,
    }
  }

  const nineA = offering({ name: 'Nine', section: 'A' })

  it("a target_type='all' task always matches, regardless of class/section", () => {
    expect(homeworkTargetsOffering(legacyTask({ target_type: 'all' }), nineA)).toBe(true)
    // Even a class-only-looking name that doesn't match this Offering at all —
    // 'all' overrides every other field.
    expect(
      homeworkTargetsOffering(legacyTask({ target_type: 'all', target_class_name: 'Ten', target_section: 'Z' }), nineA),
    ).toBe(true)
  })

  it('a specific target with no section reaches every section of that class', () => {
    expect(
      homeworkTargetsOffering(legacyTask({ target_type: 'specific', target_class_name: 'Nine' }), nineA),
    ).toBe(true)
    expect(
      homeworkTargetsOffering(
        legacyTask({ target_type: 'specific', target_class_name: 'Nine' }),
        offering({ name: 'Nine', section: 'B' }),
      ),
    ).toBe(true)
  })

  it('a specific target with a section narrows to that section only', () => {
    expect(
      homeworkTargetsOffering(legacyTask({ target_type: 'specific', target_class_name: 'Nine', target_section: 'A' }), nineA),
    ).toBe(true)
    expect(
      homeworkTargetsOffering(
        legacyTask({ target_type: 'specific', target_class_name: 'Nine', target_section: 'A' }),
        offering({ name: 'Nine', section: 'B' }),
      ),
    ).toBe(false)
  })

  it('a specific target for a different class never matches', () => {
    expect(
      homeworkTargetsOffering(legacyTask({ target_type: 'specific', target_class_name: 'Ten' }), nineA),
    ).toBe(false)
  })

  it('a section-only target (no class chosen) reaches every class in that section', () => {
    // Caught by code review alongside the SQL-side fix (student_matches_target
    // dropped this same null-class guard) — a valid, create-form-permitted
    // submission (validateTargetSelection only requires className OR section).
    expect(
      homeworkTargetsOffering(legacyTask({ target_type: 'specific', target_section: 'A' }), nineA),
    ).toBe(true)
    expect(
      homeworkTargetsOffering(
        legacyTask({ target_type: 'specific', target_section: 'A' }),
        offering({ name: 'Ten', section: 'B' }),
      ),
    ).toBe(false)
  })

  // Parity with the shared predicate (map #598 Wave 1/#602's own scenario
  // table, also asserted against the SQL predicate in
  // tests/integration/publishing-targeting.test.ts): homeworkTargetsOffering
  // must agree with targetMatchesOffering on every target_scope-populated
  // scenario, not just the legacy shape above -- the acceptance criterion
  // #605 itself names ("a thin wrapper over the shared predicate, not
  // independent logic").
  for (const scenario of PUBLICATION_TARGET_SCENARIOS) {
    it(`agrees with the shared predicate: ${scenario.description}`, () => {
      const task: HomeworkTargetRow = {
        target_scope: scenario.target.scope,
        target_type: 'specific',
        class_offering_id: scenario.target.classOfferingId,
        target_class_name: scenario.target.className,
        target_academic_year: scenario.target.academicYear,
        target_shift: scenario.target.shift,
        target_group_department: scenario.target.groupDepartment,
        target_section: scenario.target.section,
      }
      const row: OfferingRow = {
        id: scenario.offering.id,
        name: scenario.offering.name,
        academic_year: scenario.offering.academicYear,
        shift: scenario.offering.shift,
        group_department: scenario.offering.groupDepartment,
        section: scenario.offering.section,
      }
      expect(homeworkTargetsOffering(task, row)).toBe(scenario.expected)
    })
  }
})
