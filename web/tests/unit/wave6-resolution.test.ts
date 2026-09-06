import { describe, it, expect } from 'vitest'
import { classCatalogueOptions, findClassCatalogueId, type ClassCatalogueRow } from '@/lib/class-catalogue'

// Wave 6 (issue #591) migration 0183/0184's own SQL resolves a Student's
// class_name/section to a Class Offering with:
//
//   co.name = student.class_name
//   AND coalesce(co.section, '') = coalesce(student.section, '')
//
// This is a plain-TS mirror of that exact predicate, kept here to pin it
// against #572's own "one authoritative source" for this identical
// problem: findClassCatalogueId(classCatalogueOptions(rows), className,
// section) — not rosterFor(), which was considered and rejected as the
// comparison point here: rosterFor treats an EMPTY section string as "no
// section filter at all" (the picker's "All Classes" behavior), whereas
// this migration needs "match a specifically null/absent section" — a
// different question findClassCatalogueId already answers correctly
// (classCatalogueOptions maps every row's section through `?? ''` on both
// sides before comparing, so null-section-to-null-section is a real, exact
// match, not a wildcard). If the migration's SQL predicate ever disagreed
// with this, it would silently enroll a different set of Students than
// #572's own resolution mechanism would ever have matched.
function resolvesToOffering(
  student: { class_name: string | null; section: string | null },
  offering: { name: string; section: string | null },
): boolean {
  return student.class_name === offering.name && (student.section ?? '') === (offering.section ?? '')
}

describe("Wave 6's Offering-resolution predicate matches #572's findClassCatalogueId", () => {
  const rows: ClassCatalogueRow[] = [
    { id: 'off-six-a', name: 'Six', section: 'A' },
    { id: 'off-seven', name: 'Seven', section: null },
    { id: 'off-nine-b', name: 'Nine', section: 'B' },
  ]
  const options = classCatalogueOptions(rows)

  const students = [
    { id: 'a', class_name: 'Six', section: 'A' },
    { id: 'b', class_name: 'Seven', section: null },
    { id: 'c', class_name: 'Nine', section: 'A' }, // section mismatch
    { id: 'd', class_name: 'six', section: 'A' }, // case mismatch
    { id: 'e', class_name: null, section: null },
  ]

  it('resolves to the same Offering id findClassCatalogueId would, for every Student', () => {
    for (const student of students) {
      const viaFindId = findClassCatalogueId(options, student.class_name ?? '', student.section ?? '')
      const viaMigrationPredicate = rows.find((r) => resolvesToOffering(student, r))?.id ?? ''
      expect(viaMigrationPredicate).toBe(viaFindId)
    }
  })

  it('is case-sensitive', () => {
    expect(resolvesToOffering(students[3], rows[0])).toBe(false)
    expect(findClassCatalogueId(options, 'six', 'A')).toBe('')
  })

  it('a null class_name never resolves to any Offering', () => {
    for (const row of rows) expect(resolvesToOffering(students[4], row)).toBe(false)
    expect(findClassCatalogueId(options, '', '')).toBe('')
  })

  it('a sectionless Student resolves only to a sectionless Offering, not a wildcard match', () => {
    expect(resolvesToOffering(students[1], rows[1])).toBe(true) // Seven, null section
    expect(resolvesToOffering(students[1], rows[0])).toBe(false) // Six, section 'A' -- different class entirely anyway
    // The actual point: a student in "Six" with NO section must not resolve to
    // Six/A just because both compare against '' somewhere -- only an
    // Offering that is ALSO sectionless would match a sectionless Student.
    const sixNoSection = { class_name: 'Six', section: null }
    expect(resolvesToOffering(sixNoSection, rows[0])).toBe(false)
  })
})
