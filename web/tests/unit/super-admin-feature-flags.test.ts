import { describe, it, expect } from 'vitest'
import { FEATURE_FLAGS, FEATURE_FLAG_KEY, isFeatureFlag } from '@/lib/super-admin/feature-flags'

describe('isFeatureFlag', () => {
  it('accepts known keys', () => {
    expect(isFeatureFlag('exams')).toBe(true)
    expect(isFeatureFlag('sms')).toBe(true)
  })
  it('rejects unknown keys', () => {
    expect(isFeatureFlag('rfid')).toBe(false)
    expect(isFeatureFlag('')).toBe(false)
  })
})

describe('FEATURE_FLAG_KEY', () => {
  it('every flag has a label key', () => {
    for (const flag of FEATURE_FLAGS) expect(FEATURE_FLAG_KEY[flag]).toMatch(/^sa\.flags\./)
  })
})
