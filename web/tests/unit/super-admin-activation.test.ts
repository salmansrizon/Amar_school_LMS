import { describe, it, expect } from 'vitest'
import { buildActivationUrl } from '@/lib/super-admin/activation'

describe('buildActivationUrl', () => {
  it('builds an apex /claim URL carrying the code', () => {
    expect(buildActivationUrl('amarschool.com', 'ABC123')).toBe('https://amarschool.com/claim?code=ABC123')
  })
  it('url-encodes the code', () => {
    expect(buildActivationUrl('localhost', 'a b/c')).toBe('https://localhost/claim?code=a%20b%2Fc')
  })
})
