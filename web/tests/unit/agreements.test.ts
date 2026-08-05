import { describe, it, expect } from 'vitest'
import { nextAgreementVersion, canDeleteVersion, latestVersion } from '@/lib/partner/agreements'

describe('nextAgreementVersion', () => {
  it('is 1 when there are no versions yet', () => {
    expect(nextAgreementVersion([])).toBe(1)
  })
  it('is max + 1 (not count + 1) so gaps never collide', () => {
    expect(nextAgreementVersion([1, 2, 5])).toBe(6)
  })
})

describe('canDeleteVersion', () => {
  it('allows deleting a version nobody has accepted', () => {
    expect(canDeleteVersion(3, [1, 2])).toBe(true)
  })
  it('refuses deleting a version with acceptances (legal record)', () => {
    expect(canDeleteVersion(2, [1, 2])).toBe(false)
  })
})

describe('latestVersion', () => {
  it('returns the highest version number', () => {
    expect(latestVersion([{ version: 1 }, { version: 3 }, { version: 2 }])).toBe(3)
  })
  it('is null when empty', () => {
    expect(latestVersion([])).toBeNull()
  })
})
