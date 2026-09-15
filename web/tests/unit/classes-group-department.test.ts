import { describe, it, expect } from 'vitest'
import { configuredEducationLevelOptions } from '@/lib/classes'
import { GROUP_DEPARTMENTS, isBuiltInGroupDepartment } from '@/lib/institute'

// Seam: Add Class's Education Level + Group/Department dropdowns (issues
// #633, #635, ADR 0025).

describe('configuredEducationLevelOptions', () => {
  it('returns nothing when the School has configured no Education Level', () => {
    expect(configuredEducationLevelOptions([])).toEqual([])
  })

  it("returns only the School's configured levels", () => {
    const options = configuredEducationLevelOptions(['secondary'])
    expect(options).toHaveLength(1)
    expect(options[0].key).toBe('secondary')
  })

  it("orders by the platform's fixed vocabulary order, not the input array order", () => {
    // Deliberately reversed input — output should still be primary, secondary.
    const options = configuredEducationLevelOptions(['secondary', 'primary'])
    expect(options.map((o) => o.key)).toEqual(['primary', 'secondary'])
  })

  it('ignores an unknown/stale key rather than throwing', () => {
    expect(configuredEducationLevelOptions(['not_a_real_level'])).toEqual([])
  })
})

describe('isBuiltInGroupDepartment', () => {
  it('recognizes all three built-in choices', () => {
    for (const g of GROUP_DEPARTMENTS) {
      expect(isBuiltInGroupDepartment(g)).toBe(true)
    }
  })

  it('is exact-match, not case-insensitive — a School-typed value is never mistaken for a built-in', () => {
    expect(isBuiltInGroupDepartment('science')).toBe(false)
    expect(isBuiltInGroupDepartment('SCIENCE')).toBe(false)
  })

  it('rejects a custom value', () => {
    expect(isBuiltInGroupDepartment('Physics')).toBe(false)
  })
})
