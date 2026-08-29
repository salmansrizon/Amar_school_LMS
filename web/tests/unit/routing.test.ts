import { describe, it, expect } from 'vitest'
import { homeFor, canAccess, isProtectedPath, type Role } from '@/lib/auth/routing'
import { SCHOOL_MODULES, SCHOOL_QUICK_ACTIONS, flattenSchoolModules } from '@/lib/school-nav'
import { GRANTABLE_SCREENS } from '@/lib/auth/screens'

describe('homeFor: post-login redirect per role (issue #1)', () => {
  it.each([
    ['school_owner', '/school'],
    ['staff_user', '/school'],
    ['distributor', '/distributor'],
    ['agent', '/agent'],
    ['super_admin', '/super-admin'],
    ['gov_official', '/gov'],
    ['student', '/student'],
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
    ['distributor', '/school/students'],
    ['gov_official', '/school'],
    ['school_owner', '/super-admin/schools'],
    ['staff_user', '/distributor'],
    ['distributor', '/super-admin'],
    ['agent', '/distributor'],
    ['super_admin', '/school'],
    ['gov_official', '/distributor'],
    ['student', '/school/students'],
    ['school_owner', '/student'],
    ['staff_user', '/student/results'],
  ] as [Role, string][])('%s is blocked from %s', (role, path) => {
    expect(canAccess(role, path)).toBe(false)
  })

  it('matches whole path segments, not string prefixes', () => {
    expect(canAccess('distributor', '/distributorship')).toBe(true) // not a protected group
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
      'fees', 'sms', 'notices', 'institute', 'staff',
    ]) {
      expect(screens).toContain(screen)
    }
  })

  // Guardian feedback is HIDDEN, not removed (#510) — a nav decision and a
  // temporary one. The route, the table, the grant key and the feature key all
  // survive; only the two nav/search entries go. Pinned here so "unhide it"
  // stays one commented line in each file rather than an archaeology exercise.
  it('no longer lists guardian feedback in the sidebar', () => {
    expect(flattenSchoolModules().some((m) => m.screen === 'feedback')).toBe(false)
  })

  it('keeps the `feedback` grant key grantable', () => {
    // Dropping it would silently widen /school/feedback from "granted staff
    // only" to "anyone who types the URL" (ADR 0018).
    expect(GRANTABLE_SCREENS.map((s) => s.key)).toContain('feedback')
  })

  it("the dashboard Quick Action for attendance still points at its own route", () => {
    const qa = SCHOOL_QUICK_ACTIONS.find((a) => a.screen === 'attendance')
    expect(qa?.href).toBe('/school/attendance')
  })
})
