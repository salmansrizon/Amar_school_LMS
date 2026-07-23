import { describe, it, expect } from 'vitest'
import { homeFor, canAccess, isProtectedPath, type Role } from '@/lib/auth/routing'
import { SCHOOL_MODULES, SCHOOL_QUICK_ACTIONS, flattenSchoolModules } from '@/lib/school-nav'

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

// Nav grouping (issue #101, docs/improvement.md Known Issues §1): Attendance
// sits under Class & Curriculum because attendance depends on class
// information. Position only — routes and grant keys are untouched.
describe('SCHOOL_MODULES grouping', () => {
  it('nests Attendance under Class & Curriculum', () => {
    const classes = SCHOOL_MODULES.find((m) => m.screen === 'classes')
    expect(classes?.children?.map((c) => c.screen)).toEqual(['attendance'])
  })

  it('no longer lists Attendance at the top level', () => {
    expect(SCHOOL_MODULES.some((m) => m.screen === 'attendance')).toBe(false)
  })

  it('keeps the attendance route exactly where it was — no redirects needed', () => {
    const attendance = flattenSchoolModules().find((m) => m.screen === 'attendance')
    expect(attendance?.href).toBe('/school/attendance')
  })

  it('keeps every module reachable when flattened, parents and children alike', () => {
    const screens = flattenSchoolModules().map((m) => m.screen)
    for (const screen of [
      'students', 'employees', 'attendance', 'classes', 'exams',
      'fees', 'sms', 'notices', 'feedback', 'institute', 'staff',
    ]) {
      expect(screens).toContain(screen)
    }
  })

  it("the dashboard Quick Action for attendance still points at its own route", () => {
    const qa = SCHOOL_QUICK_ACTIONS.find((a) => a.screen === 'attendance')
    expect(qa?.href).toBe('/school/attendance')
  })
})
