import { describe, it, expect } from 'vitest'
import { sanitizeEducationScope } from '@/lib/super-admin/gov'

describe('sanitizeEducationScope', () => {
  it('keeps known levels in canonical order', () => {
    expect(sanitizeEducationScope(['secondary', 'primary'])).toEqual(['primary', 'secondary'])
  })
  it('drops unknown values', () => {
    expect(sanitizeEducationScope(['primary', 'college', 'higher_secondary'])).toEqual([
      'primary',
      'higher_secondary',
    ])
  })
  it('empty selection → empty scope', () => {
    expect(sanitizeEducationScope([])).toEqual([])
  })
})
