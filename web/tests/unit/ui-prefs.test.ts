import { describe, it, expect } from 'vitest'
import { SIDEBAR_COOKIE, SIDEBAR_MAX_AGE, parseSidebarCollapsed, sidebarCookieAssignment } from '@/lib/ui-prefs'

// Sidebar collapse is a deliberate user preference, so it persists in a cookie the
// server reads before first paint (issue #115) — same convention as `lang`.
describe('parseSidebarCollapsed (issue #115)', () => {
  it('treats "1" as collapsed', () => {
    expect(parseSidebarCollapsed('1')).toBe(true)
  })
  it('treats "0" as expanded', () => {
    expect(parseSidebarCollapsed('0')).toBe(false)
  })
  it('defaults to expanded when the cookie is missing or unrecognised', () => {
    expect(parseSidebarCollapsed(undefined)).toBe(false)
    expect(parseSidebarCollapsed('')).toBe(false)
    expect(parseSidebarCollapsed('true')).toBe(false)
  })
})

describe('sidebarCookieAssignment', () => {
  it('writes a year-long, path-wide cookie so the choice survives refresh and re-login', () => {
    expect(sidebarCookieAssignment(true)).toBe(`${SIDEBAR_COOKIE}=1;path=/;max-age=${SIDEBAR_MAX_AGE};samesite=lax`)
    expect(sidebarCookieAssignment(false)).toBe(`${SIDEBAR_COOKIE}=0;path=/;max-age=${SIDEBAR_MAX_AGE};samesite=lax`)
  })
  it('uses a max-age of one year', () => {
    expect(SIDEBAR_MAX_AGE).toBe(31536000)
  })
})
