import type { CandidateOffering, LegacyPublicationTarget, PublicationTarget } from '@/lib/publishing'

// Shared parity table (issue #595, map #598 Wave 1, #602) -- asserted against
// BOTH the TS predicate (tests/unit/publishing-targeting.test.ts) and its SQL
// mirror, publication_target_matches_offering (tests/integration/publishing-
// targeting.test.ts). One scenario table, two implementations proven to
// agree on every row -- the whole point of a shared resolution primitive is
// that nobody has to trust the two copies stay in sync by inspection.

export interface TargetingScenario {
  description: string
  target: PublicationTarget
  offering: CandidateOffering
  expected: boolean
}

const offeringNineMorningScience: CandidateOffering = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Nine',
  academicYear: 2026,
  shift: 'Morning',
  groupDepartment: 'Science',
  section: 'A',
}

const offeringNineDayCommerce: CandidateOffering = {
  id: '22222222-2222-2222-2222-222222222222',
  name: 'Nine',
  academicYear: 2026,
  shift: 'Day',
  groupDepartment: 'Commerce',
  section: 'B',
}

const offeringNineMorningScience2027: CandidateOffering = {
  ...offeringNineMorningScience,
  id: '33333333-3333-3333-3333-333333333333',
  academicYear: 2027,
}

const offeringNoShiftNoGroupNoSection: CandidateOffering = {
  id: '44444444-4444-4444-4444-444444444444',
  name: 'Eleven',
  academicYear: 2026,
  shift: null,
  groupDepartment: null,
  section: null,
}

export const PUBLICATION_TARGET_SCENARIOS: TargetingScenario[] = [
  {
    description: 'all scope matches any Offering',
    target: { scope: 'all', classOfferingId: null, className: null, academicYear: null, shift: null, groupDepartment: null, section: null },
    offering: offeringNineMorningScience,
    expected: true,
  },
  {
    description: 'all scope matches an unrelated Offering too',
    target: { scope: 'all', classOfferingId: null, className: null, academicYear: null, shift: null, groupDepartment: null, section: null },
    offering: offeringNoShiftNoGroupNoSection,
    expected: true,
  },
  {
    description: 'offering scope matches only the exact id',
    target: { scope: 'offering', classOfferingId: offeringNineMorningScience.id, className: null, academicYear: null, shift: null, groupDepartment: null, section: null },
    offering: offeringNineMorningScience,
    expected: true,
  },
  {
    description: 'offering scope rejects a same-name-and-section Offering with a different id (the #593 scenario)',
    target: { scope: 'offering', classOfferingId: offeringNineMorningScience.id, className: null, academicYear: null, shift: null, groupDepartment: null, section: null },
    offering: offeringNineDayCommerce,
    expected: false,
  },
  {
    description: 'broadcast, all dimensions Any: matches every Offering sharing the Class name in the pinned year',
    target: { scope: 'broadcast', classOfferingId: null, className: 'Nine', academicYear: 2026, shift: null, groupDepartment: null, section: null },
    offering: offeringNineMorningScience,
    expected: true,
  },
  {
    description: 'broadcast, all dimensions Any: matches a second Offering with the same name+year, different Shift/Group/Section',
    target: { scope: 'broadcast', classOfferingId: null, className: 'Nine', academicYear: 2026, shift: null, groupDepartment: null, section: null },
    offering: offeringNineDayCommerce,
    expected: true,
  },
  {
    description: 'broadcast is pinned to one Academic Year: does not span years even with every other dimension Any',
    target: { scope: 'broadcast', classOfferingId: null, className: 'Nine', academicYear: 2026, shift: null, groupDepartment: null, section: null },
    offering: offeringNineMorningScience2027,
    expected: false,
  },
  {
    description: 'broadcast with a specific Shift excludes a different Shift',
    target: { scope: 'broadcast', classOfferingId: null, className: 'Nine', academicYear: 2026, shift: 'Morning', groupDepartment: null, section: null },
    offering: offeringNineDayCommerce,
    expected: false,
  },
  {
    description: 'broadcast with a specific Shift includes the matching Shift regardless of Group/Section',
    target: { scope: 'broadcast', classOfferingId: null, className: 'Nine', academicYear: 2026, shift: 'Morning', groupDepartment: null, section: null },
    offering: offeringNineMorningScience,
    expected: true,
  },
  {
    description: 'broadcast with a specific Group Department excludes a different Group Department',
    target: { scope: 'broadcast', classOfferingId: null, className: 'Nine', academicYear: 2026, shift: null, groupDepartment: 'Science', section: null },
    offering: offeringNineDayCommerce,
    expected: false,
  },
  {
    description: 'broadcast with a specific Section excludes a different Section',
    target: { scope: 'broadcast', classOfferingId: null, className: 'Nine', academicYear: 2026, shift: null, groupDepartment: null, section: 'A' },
    offering: offeringNineDayCommerce,
    expected: false,
  },
  {
    description: 'broadcast fully pinned (every dimension specific) behaves like an exact match',
    target: { scope: 'broadcast', classOfferingId: null, className: 'Nine', academicYear: 2026, shift: 'Morning', groupDepartment: 'Science', section: 'A' },
    offering: offeringNineMorningScience,
    expected: true,
  },
  {
    description: 'broadcast rejects a different Class name entirely',
    target: { scope: 'broadcast', classOfferingId: null, className: 'Eight', academicYear: 2026, shift: null, groupDepartment: null, section: null },
    offering: offeringNineMorningScience,
    expected: false,
  },
  {
    description: 'broadcast Any dimensions match an Offering whose own Shift/Group/Section are null (a No-Shift/no-Group School)',
    target: { scope: 'broadcast', classOfferingId: null, className: 'Eleven', academicYear: 2026, shift: null, groupDepartment: null, section: null },
    offering: offeringNoShiftNoGroupNoSection,
    expected: true,
  },
  {
    description: 'broadcast with a specific Section does not match an Offering with no Section (null is not "any value", it is Any only on the target side)',
    target: { scope: 'broadcast', classOfferingId: null, className: 'Eleven', academicYear: 2026, shift: null, groupDepartment: null, section: 'A' },
    offering: offeringNoShiftNoGroupNoSection,
    expected: false,
  },
]

// Legacy (target_scope IS NULL) parity table -- caught by code review as a
// real gap (map #598 Wave 4/#605): the primary predicate above is proven
// identical across TS/SQL by PUBLICATION_TARGET_SCENARIOS, but
// targetMatchesOfferingLegacy (lib/publishing.ts) and its SQL mirror,
// publication_target_matches_offering_legacy (migration 0196), had no such
// proof -- exactly the "trust the two copies stay in sync by inspection"
// risk the primary predicate's own parity table exists to close. Asserted
// against both tests/unit/publishing-targeting.test.ts (TS) and
// tests/integration/publishing-targeting.test.ts (SQL, via
// publication_target_matches_offering_legacy directly).
export interface LegacyTargetingScenario {
  description: string
  target: LegacyPublicationTarget
  offering: { name: string; section: string | null }
  expected: boolean
}

export const LEGACY_TARGET_SCENARIOS: LegacyTargetingScenario[] = [
  {
    description: "target_type='all' matches regardless of class/section",
    target: { targetType: 'all', targetClassName: 'Ten', targetSection: 'Z' },
    offering: { name: 'Nine', section: 'A' },
    expected: true,
  },
  {
    description: 'a specific target with no section reaches every section of that class',
    target: { targetType: 'specific', targetClassName: 'Nine', targetSection: null },
    offering: { name: 'Nine', section: 'B' },
    expected: true,
  },
  {
    description: 'a specific target with a section narrows to that section only',
    target: { targetType: 'specific', targetClassName: 'Nine', targetSection: 'A' },
    offering: { name: 'Nine', section: 'B' },
    expected: false,
  },
  {
    description: 'a specific target for a different class never matches',
    target: { targetType: 'specific', targetClassName: 'Ten', targetSection: null },
    offering: { name: 'Nine', section: 'A' },
    expected: false,
  },
  {
    description: 'a section-only target (no class chosen) reaches every class in that section',
    target: { targetType: 'specific', targetClassName: null, targetSection: 'A' },
    offering: { name: 'Nine', section: 'A' },
    expected: true,
  },
  {
    description: 'a section-only target does not match a different section',
    target: { targetType: 'specific', targetClassName: null, targetSection: 'A' },
    offering: { name: 'Ten', section: 'B' },
    expected: false,
  },
  {
    description: 'a specific target with a section against an Offering with no Section (empty-string normalization)',
    target: { targetType: 'specific', targetClassName: 'Nine', targetSection: '' },
    offering: { name: 'Nine', section: null },
    expected: true,
  },
]
