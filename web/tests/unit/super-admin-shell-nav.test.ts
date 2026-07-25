import { describe, expect, it } from 'vitest'
import { isNavActive } from '@/lib/super-admin/shell-nav'
import { avatarInitials } from '@/lib/name'

// Pure seam behind the super-admin shell (map #171, T1). The shell is otherwise
// presentational; these two decisions are the only logic worth pinning down.

describe('isNavActive', () => {
  it('matches the dashboard root only exactly (never a prefix)', () => {
    expect(isNavActive('/super-admin', '/super-admin')).toBe(true)
    expect(isNavActive('/super-admin/schools', '/super-admin')).toBe(false)
  })

  it('matches a section by prefix so child routes stay highlighted', () => {
    expect(isNavActive('/super-admin/schools', '/super-admin/schools')).toBe(true)
    expect(isNavActive('/super-admin/schools/abc', '/super-admin/schools')).toBe(true)
    expect(isNavActive('/super-admin/codes', '/super-admin/schools')).toBe(false)
  })
})

describe('avatarInitials', () => {
  it('takes the first letter of the first two words, uppercased', () => {
    expect(avatarInitials('Salman Sakib')).toBe('SS')
    expect(avatarInitials('nasir uddin ahmed')).toBe('NU')
  })

  it('handles a single word', () => {
    expect(avatarInitials('Admin')).toBe('A')
  })

  it('falls back to A on empty / whitespace', () => {
    expect(avatarInitials('')).toBe('A')
    expect(avatarInitials('   ')).toBe('A')
  })
})
