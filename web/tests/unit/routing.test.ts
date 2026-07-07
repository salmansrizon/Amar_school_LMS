import { describe, it, expect } from 'vitest'
import { homeFor, canAccess, isProtectedPath, type Role } from '@/lib/auth/routing'

describe('homeFor: post-login redirect per role (issue #1)', () => {
  it.each([
    ['school_owner', '/school'],
    ['staff_user', '/school'],
    ['dealer', '/dealer'],
    ['super_admin', '/super-admin'],
    ['gov_official', '/gov'],
  ] as [Role, string][])('%s lands in %s', (role, home) => {
    expect(homeFor(role)).toBe(home)
  })
})

describe('canAccess: a role is blocked from other roles’ route groups', () => {
  it('School Owner and Staff User may access /school/*', () => {
    expect(canAccess('school_owner', '/school/students')).toBe(true)
    expect(canAccess('staff_user', '/school')).toBe(true)
  })

  it.each([
    ['dealer', '/school/students'],
    ['gov_official', '/school'],
    ['school_owner', '/super-admin/schools'],
    ['staff_user', '/dealer'],
    ['dealer', '/super-admin'],
    ['super_admin', '/school'],
    ['gov_official', '/dealer'],
  ] as [Role, string][])('%s is blocked from %s', (role, path) => {
    expect(canAccess(role, path)).toBe(false)
  })

  it('matches whole path segments, not string prefixes', () => {
    expect(canAccess('dealer', '/dealership')).toBe(true) // not a protected group
    expect(canAccess('school_owner', '/schools-public')).toBe(true) // not /school group
  })
})

describe('isProtectedPath', () => {
  it('role route groups are protected', () => {
    expect(isProtectedPath('/school/anything')).toBe(true)
    expect(isProtectedPath('/super-admin')).toBe(true)
  })
  it('public pages are not', () => {
    expect(isProtectedPath('/')).toBe(false)
    expect(isProtectedPath('/login')).toBe(false)
  })
})
