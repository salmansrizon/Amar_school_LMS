import { describe, expect, it } from 'vitest'
import { PERMISSIONS } from '@/lib/engines/policy/catalog'

// The catalog keys must stay in lockstep with the seed in 0080_policy_engine.sql.
describe('permission catalog', () => {
  it('matches the seeded permission keys', () => {
    expect(Object.values(PERMISSIONS).sort()).toEqual(
      ['dealer.access', 'gov.access', 'institute.manage', 'school.access', 'school.owner', 'super_admin.access'].sort(),
    )
  })
})
