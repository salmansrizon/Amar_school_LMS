import { describe, it, expect } from 'vitest'
import { screenKeyForPath, canOpenScreen, GRANTABLE_SCREENS, FEATURE_KEYS, SCREENS } from '@/lib/auth/screens'
import { SCHOOL_MODULES, SCHOOL_QUICK_ACTIONS, flattenSchoolModules } from '@/lib/school-nav'
import { SCHOOL_SEARCH } from '@/lib/school-search'

describe('screenKeyForPath: maps /school/* URLs to screen keys', () => {
  it.each([
    ['/school/students', 'students'],
    ['/school/students/123/behaviour', 'students'],
    ['/school/exams', 'exams'],
    ['/school/fees/collect', 'fees'],
  ])('%s → %s', (path, key) => {
    expect(screenKeyForPath(path)).toBe(key)
  })

  it('the school home is a screen of its own, not a null', () => {
    // Was the `ScreenKey | 'dashboard'` sentinel, written independently in two
    // files (#515). It is a registry row now, so the union is gone.
    expect(screenKeyForPath('/school')).toBe('dashboard')
    expect(screenKeyForPath('/school/')).toBe('dashboard')
  })

  it('names the member screens that used to answer null', () => {
    // #513: reachable with no entry anywhere. `null` meant ungated in proxy.ts.
    expect(screenKeyForPath('/school/questions')).toBe('questions')
    expect(screenKeyForPath('/school/corrections')).toBe('corrections')
    expect(screenKeyForPath('/school/permission-denied')).toBe('permission-denied')
  })

  it('returns null for a segment with no registry row, and for other products', () => {
    // This is the value proxy.ts now refuses on. A typo'd href lands here.
    expect(screenKeyForPath('/school/studnets')).toBeNull()
    expect(screenKeyForPath('/school/anything-new')).toBeNull()
    expect(screenKeyForPath('/distributor/anything')).toBeNull()
    expect(screenKeyForPath('/schools')).toBeNull()
  })

  it('staff management is not a grantable screen (owner-only)', () => {
    expect(GRANTABLE_SCREENS.map((s) => s.key)).not.toContain('staff')
    expect(screenKeyForPath('/school/staff')).toBe('staff')
  })
})

describe('canOpenScreen: legacy allow-list model (issue #2)', () => {
  it('School Owner always has access, regardless of grants', () => {
    expect(canOpenScreen('school_owner', [], 'students')).toBe(true)
    expect(canOpenScreen('school_owner', [], 'staff')).toBe(true)
  })

  it('Staff User needs an explicit grant for the screen', () => {
    expect(canOpenScreen('staff_user', ['students', 'fees'], 'students')).toBe(true)
    expect(canOpenScreen('staff_user', ['students'], 'exams')).toBe(false)
    expect(canOpenScreen('staff_user', [], 'students')).toBe(false)
  })

  it('a grant gives full access within the screen — no per-action model exists', () => {
    // The API is screen-key based only; granting 'exams' answers true for any
    // path in that screen, including destructive ones (Close Exam relies on this).
    expect(canOpenScreen('staff_user', ['exams'], screenKeyForPath('/school/exams/9/close')!)).toBe(true)
  })

  it('Staff User can never open owner-only screens', () => {
    expect(canOpenScreen('staff_user', ['staff'], 'staff')).toBe(false)
  })
})

describe('the registry is the one copy (#515)', () => {
  it('derives the feature keys from the grantable screens', () => {
    // Was a second array in lib/engines/feature/catalog.ts — same ten strings,
    // same order, nothing comparing the two.
    expect(FEATURE_KEYS).toEqual(GRANTABLE_SCREENS.map((s) => s.key))
  })

  it('has no duplicate keys', () => {
    expect(new Set(SCREENS.map((s) => s.key)).size).toBe(SCREENS.length)
  })

  it('every nav, quick action and search href lands on a registered screen', () => {
    // The typo guard. proxy.ts refuses a segment with no row, so an href whose
    // first segment is misspelt is now a broken link — and this fails first.
    //
    // Deliberately NOT asserting screenKeyForPath(href) === entry.screen: a nav
    // entry's `screen` is what gates the ENTRY, and two of them ride a grant
    // other than their own path on purpose (/school/corrections under the
    // students grant, /school/questions under feedback, #454/#456). Equality
    // would forbid that; non-null catches the failure this exists for.
    const hrefs = [
      ...flattenSchoolModules(SCHOOL_MODULES).map((m) => m.href),
      ...SCHOOL_QUICK_ACTIONS.map((q) => q.href),
      ...SCHOOL_SEARCH.map((e) => e.href),
    ]
    for (const href of hrefs) {
      expect(screenKeyForPath(href), `${href} has no screen registry row`).not.toBeNull()
    }
  })

  it('gates every member screen without a permission grant', () => {
    for (const screen of SCREENS.filter((s) => s.gate === 'member')) {
      expect(canOpenScreen('staff_user', [], screen.key)).toBe(true)
    }
  })
})
