import { describe, it, expect } from 'vitest'
import { targetMatchesOffering } from '@/lib/publishing'
import { PUBLICATION_TARGET_SCENARIOS } from '@/lib/publishing-targeting-scenarios'

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
