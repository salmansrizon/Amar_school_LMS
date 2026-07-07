import { describe, it, expect } from 'vitest'
import { screenKeyForPath, canOpenScreen, GRANTABLE_SCREENS } from '@/lib/auth/screens'

describe('screenKeyForPath: maps /school/* URLs to screen keys', () => {
  it.each([
    ['/school/students', 'students'],
    ['/school/students/123/behaviour', 'students'],
    ['/school/exams', 'exams'],
    ['/school/fees/collect', 'fees'],
  ])('%s → %s', (path, key) => {
    expect(screenKeyForPath(path)).toBe(key)
  })

  it('returns null for the school home and non-screen paths', () => {
    expect(screenKeyForPath('/school')).toBeNull()
    expect(screenKeyForPath('/school/permission-denied')).toBeNull()
    expect(screenKeyForPath('/dealer/anything')).toBeNull()
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
