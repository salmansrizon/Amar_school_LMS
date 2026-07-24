import { describe, expect, it } from 'vitest'
import { claimErrorKey } from '@/lib/claim'

describe('claimErrorKey', () => {
  it('maps invalid / used code', () => {
    expect(claimErrorKey('invalid code')).toBe('claim.invalidCode')
    expect(claimErrorKey('code already used')).toBe('claim.invalidCode')
  })
  it('maps taken subdomain', () => {
    expect(claimErrorKey('subdomain already taken')).toBe('claim.slugTaken')
  })
  it('maps invalid subdomain', () => {
    expect(claimErrorKey('invalid subdomain')).toBe('claim.slugInvalid')
  })
  it('maps already-bound owner', () => {
    expect(claimErrorKey('profile already exists')).toBe('claim.alreadyOwner')
  })
  it('falls back for anything else', () => {
    expect(claimErrorKey('some db error')).toBe('claim.failed')
    expect(claimErrorKey(undefined)).toBe('claim.failed')
  })
})
