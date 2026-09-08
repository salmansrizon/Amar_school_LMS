import { describe, it, expect } from 'vitest'
import { targetMatchesOffering, targetMatchesOfferingLegacy } from '@/lib/publishing'
import { LEGACY_TARGET_SCENARIOS, PUBLICATION_TARGET_SCENARIOS } from '@/lib/publishing-targeting-scenarios'

// issue #595, map #598 Wave 1 (#602) -- the TS half of the shared resolution
// primitive's parity proof. The SQL half (publication_target_matches_offering)
// is proven against the exact same scenario table in
// tests/integration/publishing-targeting.test.ts.
describe('targetMatchesOffering (#595, #602)', () => {
  for (const scenario of PUBLICATION_TARGET_SCENARIOS) {
    it(scenario.description, () => {
      expect(targetMatchesOffering(scenario.target, scenario.offering)).toBe(scenario.expected)
    })
  }
})

// map #598 Wave 4 (#605) -- the legacy (target_scope IS NULL) predicate's own
// parity proof, added after code review found the primary predicate had one
// but this one didn't. SQL half proven against the same table in
// tests/integration/publishing-targeting.test.ts via
// publication_target_matches_offering_legacy directly.
describe('targetMatchesOfferingLegacy (#595, #605)', () => {
  for (const scenario of LEGACY_TARGET_SCENARIOS) {
    it(scenario.description, () => {
      expect(targetMatchesOfferingLegacy(scenario.target, scenario.offering)).toBe(scenario.expected)
    })
  }
})
