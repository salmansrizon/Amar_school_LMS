import { describe, expect, it } from 'vitest'
import { brandInitial } from '@/lib/school-branding'

describe('brandInitial (logo fallback)', () => {
  it('uppercases the first letter', () => {
    expect(brandInitial('greenwood')).toBe('G')
    expect(brandInitial('Riverside High')).toBe('R')
  })
  it('trims leading whitespace', () => {
    expect(brandInitial('  আমার স্কুল')).toBe('আ')
  })
  it('falls back to # for an empty name', () => {
    expect(brandInitial('')).toBe('#')
    expect(brandInitial('   ')).toBe('#')
  })
})
